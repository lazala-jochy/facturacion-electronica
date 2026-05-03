import type { Express } from "express";

const NAMEOK = /\.(p12|pfx)$/i;

export function isAllowedCertificateMime(mime: string | undefined): boolean {
  const m = (mime ?? "").toLowerCase();
  return (
    m === "application/x-pkcs12" ||
    m === "application/octet-stream" ||
    m === "application/pkcs12"
  );
}

export function validateCertificateMulterFile(
  file: Express.Multer.File | undefined,
): Express.Multer.File | undefined {
  if (!file?.buffer?.length) return undefined;
  if (!isAllowedCertificateMime(file.mimetype)) {
    throw new Error("El certificado debe ser un archivo .p12 o .pfx.");
  }
  const orig = (file.originalname ?? "").trim();
  if (orig && !NAMEOK.test(orig)) {
    throw new Error('El archivo debe tener extensión ".p12" o ".pfx".');
  }
  return file;
}
