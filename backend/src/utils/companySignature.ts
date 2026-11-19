import fs from "fs/promises";
import path from "path";

/**
 * Valores publicos (no son secretos, por eso van hardcodeados como default): misma URL/anon key
 * que ya viaja horneada en el bundle del frontend (frontend/.env, VITE_SUPABASE_*). Igual patron
 * que companyLogo.ts.
 */
const DEFAULT_SUPABASE_FUNCTIONS_URL = "https://nhzfhxwsisfzohljdkut.supabase.co/functions/v1";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oemZoeHdzaXNmem9obGpka3V0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2MDQ0NjcsImV4cCI6MjExMDE4MDQ2N30.aDVUeB8yVXOT8cgFyo-8PWq17j9ZKBCk_sMR8U06i4w";

const extByMime: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

export const isAllowedSignatureMime = (mimetype: string) => Boolean(extByMime[mimetype]);

const KNOWN_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"];

const signaturesDir = (uploadsRoot: string) => path.join(uploadsRoot, "companies", "signatures");

/** Guarda la firma en disco local (instalaciones viejas / sin bucket configurado). */
export async function saveCompanySignatureFile(
  uploadsRoot: string,
  companyId: number,
  buffer: Buffer,
  mimetype: string,
): Promise<string | null> {
  const ext = extByMime[mimetype];
  if (!ext) return null;
  const dir = signaturesDir(uploadsRoot);
  await fs.mkdir(dir, { recursive: true });
  // Limpia extensiones previas (ej. si el usuario sube un .png despues de un .jpg).
  await removeUploadedCompanySignatureFiles(uploadsRoot, companyId);
  const filename = `${companyId}.${ext}`;
  await fs.writeFile(path.join(dir, filename), buffer);
  return `/uploads/companies/signatures/${filename}`;
}

export async function removeUploadedCompanySignatureFiles(
  uploadsRoot: string,
  companyId: number,
): Promise<void> {
  const dir = signaturesDir(uploadsRoot);
  await Promise.all(
    KNOWN_EXTENSIONS.map(async (ext) => {
      try {
        await fs.unlink(path.join(dir, `${companyId}.${ext}`));
      } catch {
        /* no existe el archivo */
      }
    }),
  );
}

/** Ruta absoluta de la firma en disco, o null si no hay archivo. */
export async function resolveCompanySignatureAbsolutePath(
  uploadsRoot: string,
  companyId: number,
  signatureUrl?: string | null,
): Promise<string | null> {
  if (signatureUrl?.trim()) {
    const rel = signatureUrl.replace(/^\/+/, "").replace(/^uploads\//, "");
    const abs = path.join(uploadsRoot, rel);
    try {
      await fs.access(abs);
      return abs;
    } catch {
      /* intentar por companyId */
    }
  }
  const dir = signaturesDir(uploadsRoot);
  for (const ext of KNOWN_EXTENSIONS) {
    const abs = path.join(dir, `${companyId}.${ext}`);
    try {
      await fs.access(abs);
      return abs;
    } catch {
      /* siguiente extensión */
    }
  }
  return null;
}

/**
 * Sube la firma al bucket de Supabase Storage. El backend local no tiene ninguna credencial de
 * Storage propia: le pide a la Edge Function `signature-upload-url` una URL firmada acotada a
 * esta empresa (segun el JWT de sesion que llega en `accessToken`), y sube el archivo directo a
 * esa URL. Devuelve la URL publica a guardar en Company.signatureUrl, o null si no hay como
 * llegar al servicio (deja la firma anterior intacta). Mismo patron que companyLogo.ts.
 */
export async function uploadCompanySignatureToBucket(
  accessToken: string,
  buffer: Buffer,
  mimetype: string,
): Promise<string | null> {
  if (!isAllowedSignatureMime(mimetype)) return null;
  const functionsUrl = process.env.SUPABASE_FUNCTIONS_URL?.trim() || DEFAULT_SUPABASE_FUNCTIONS_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim() || DEFAULT_SUPABASE_ANON_KEY;

  const signRes = await fetch(`${functionsUrl}/signature-upload-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ action: "sign", contentType: mimetype }),
  });
  if (!signRes.ok) {
    const detail = await signRes.text().catch(() => "");
    throw new Error(`No se pudo preparar la subida de la firma (${signRes.status}). ${detail}`);
  }
  const { signedUrl, publicUrl } = (await signRes.json()) as {
    signedUrl: string;
    publicUrl: string;
  };

  const uploadRes = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": mimetype },
    body: new Uint8Array(buffer),
  });
  if (!uploadRes.ok) {
    const detail = await uploadRes.text().catch(() => "");
    throw new Error(`No se pudo subir la firma al bucket (${uploadRes.status}). ${detail}`);
  }

  return publicUrl;
}

/** Borra la firma de la empresa del bucket de Supabase Storage. */
export async function removeCompanySignatureFromBucket(accessToken: string): Promise<void> {
  const functionsUrl = process.env.SUPABASE_FUNCTIONS_URL?.trim() || DEFAULT_SUPABASE_FUNCTIONS_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim() || DEFAULT_SUPABASE_ANON_KEY;
  try {
    await fetch(`${functionsUrl}/signature-upload-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ action: "delete" }),
    });
  } catch {
    /* no es critico: Company.signatureUrl igual queda en null */
  }
}

/**
 * Lee los bytes de la firma para incrustarlos en el PDF de cotización: desde el bucket si
 * `signatureUrl` es una URL absoluta, o del disco local (instalaciones viejas).
 */
export async function resolveCompanySignatureImage(
  uploadsRoot: string,
  companyId: number,
  signatureUrl?: string | null,
): Promise<Buffer | string | null> {
  if (signatureUrl?.trim() && /^https?:\/\//i.test(signatureUrl)) {
    try {
      const res = await fetch(signatureUrl);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      /* sin red/colgado: caer al disco local por si acaso */
    }
  }
  return resolveCompanySignatureAbsolutePath(uploadsRoot, companyId, signatureUrl);
}
