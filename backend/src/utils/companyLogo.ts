import fs from "fs/promises";
import path from "path";

/**
 * Valores publicos (no son secretos, por eso van hardcodeados como default):
 * misma URL/anon key que ya viaja horneada en el bundle del frontend
 * (frontend/.env, VITE_SUPABASE_*). Overridable via env si hace falta.
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

export const isAllowedLogoMime = (mimetype: string) => Boolean(extByMime[mimetype]);

export async function saveCompanyLogoFile(
  uploadsRoot: string,
  companyId: number,
  buffer: Buffer,
  mimetype: string,
): Promise<string | null> {
  const ext = extByMime[mimetype];
  if (!ext) return null;
  const companiesDir = path.join(uploadsRoot, "companies");
  await fs.mkdir(companiesDir, { recursive: true });
  const filename = `${companyId}.${ext}`;
  await fs.writeFile(path.join(companiesDir, filename), buffer);
  return `/uploads/companies/${filename}`;
}

const KNOWN_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"];

/** Ruta absoluta del logo en disco, o null si no hay archivo. */
export async function resolveCompanyLogoAbsolutePath(
  uploadsRoot: string,
  companyId: number,
  logoUrl?: string | null,
): Promise<string | null> {
  if (logoUrl?.trim()) {
    const rel = logoUrl.replace(/^\/+/, "").replace(/^uploads\//, "");
    const abs = path.join(uploadsRoot, rel);
    try {
      await fs.access(abs);
      return abs;
    } catch {
      /* intentar por companyId */
    }
  }
  const companiesDir = path.join(uploadsRoot, "companies");
  for (const ext of KNOWN_EXTENSIONS) {
    const abs = path.join(companiesDir, `${companyId}.${ext}`);
    try {
      await fs.access(abs);
      return abs;
    } catch {
      /* siguiente extensión */
    }
  }
  return null;
}

export async function removeUploadedCompanyLogoFiles(
  uploadsRoot: string,
  companyId: number,
): Promise<void> {
  const companiesDir = path.join(uploadsRoot, "companies");
  await Promise.all(
    KNOWN_EXTENSIONS.map(async (ext) => {
      try {
        await fs.unlink(path.join(companiesDir, `${companyId}.${ext}`));
      } catch {
        /* no existe el archivo */
      }
    }),
  );
}

/**
 * Sube el logo al bucket de Supabase Storage. El backend local no tiene
 * ninguna credencial de Storage propia: le pide a la Edge Function
 * `logo-upload-url` una URL firmada acotada a esta empresa (segun el JWT de
 * sesion que llega en `accessToken`), y sube el archivo directo a esa URL.
 * Devuelve la URL publica a guardar en Company.logoUrl, o null si no hay
 * como llegar al servicio (deja el logo anterior intacto).
 */
export async function uploadCompanyLogoToBucket(
  accessToken: string,
  buffer: Buffer,
  mimetype: string,
): Promise<string | null> {
  if (!isAllowedLogoMime(mimetype)) return null;
  const functionsUrl = process.env.SUPABASE_FUNCTIONS_URL?.trim() || DEFAULT_SUPABASE_FUNCTIONS_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim() || DEFAULT_SUPABASE_ANON_KEY;

  const signRes = await fetch(`${functionsUrl}/logo-upload-url`, {
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
    throw new Error(`No se pudo preparar la subida del logo (${signRes.status}). ${detail}`);
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
    throw new Error(`No se pudo subir el logo al bucket (${uploadRes.status}). ${detail}`);
  }

  return publicUrl;
}

/** Borra el logo de la empresa del bucket de Supabase Storage. */
export async function removeCompanyLogoFromBucket(accessToken: string): Promise<void> {
  const functionsUrl = process.env.SUPABASE_FUNCTIONS_URL?.trim() || DEFAULT_SUPABASE_FUNCTIONS_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim() || DEFAULT_SUPABASE_ANON_KEY;
  try {
    await fetch(`${functionsUrl}/logo-upload-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ action: "delete" }),
    });
  } catch {
    /* no es critico: Company.logoUrl igual queda en null */
  }
}

/** Lee los bytes del logo: desde el bucket si `logoUrl` es una URL absoluta, o del disco local (instalaciones viejas). */
export async function resolveCompanyLogoImage(
  uploadsRoot: string,
  companyId: number,
  logoUrl?: string | null,
): Promise<Buffer | string | null> {
  if (logoUrl?.trim() && /^https?:\/\//i.test(logoUrl)) {
    try {
      const res = await fetch(logoUrl);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      /* sin red/colgado: caer al disco local por si acaso */
    }
  }
  return resolveCompanyLogoAbsolutePath(uploadsRoot, companyId, logoUrl);
}
