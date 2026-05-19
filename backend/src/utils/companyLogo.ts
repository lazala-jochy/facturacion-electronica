import fs from "fs/promises";
import path from "path";

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
