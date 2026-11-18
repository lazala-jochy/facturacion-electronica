import fs from "fs/promises";
import path from "path";

const extByMime: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

export const isAllowedSignatureMime = (mimetype: string) => Boolean(extByMime[mimetype]);

const KNOWN_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"];

const signaturesDir = (uploadsRoot: string) => path.join(uploadsRoot, "companies", "signatures");

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

/** Lee los bytes de la firma para incrustarlos en el PDF de cotización. */
export async function resolveCompanySignatureImage(
  uploadsRoot: string,
  companyId: number,
  signatureUrl?: string | null,
): Promise<string | null> {
  return resolveCompanySignatureAbsolutePath(uploadsRoot, companyId, signatureUrl);
}
