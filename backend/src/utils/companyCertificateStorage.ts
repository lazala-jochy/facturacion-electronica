import fs from "node:fs/promises";
import path from "path";
import type { Company } from "@prisma/client";
import {
  decryptCompanyP12Payload,
  encryptCompanyCertificatePayload,
  generateCertificateSalt,
  verifyPkcs12Password,
} from "./companyCertificateCrypto";

const CERT_FILENAME = "company-certificate.enc";

/** Ruta absoluta del directorio de empresa bajo uploads. */
export function companySecureDir(uploadsRoot: string, companyId: number): string {
  return path.join(uploadsRoot, "companies", String(companyId));
}

/** Ruta absoluta del .p12 cifrado. */
export function companyCertificateAbsolutePath(uploadsRoot: string, companyId: number): string {
  return path.join(companySecureDir(uploadsRoot, companyId), CERT_FILENAME);
}

export type SaveCertificateInput = {
  uploadsRoot: string;
  companyId: number;
  p12Buffer: Buffer;
  p12Password: string;
  /** Frase que el usuario define en la UI para cifrar el .p12 en disco (no se persiste). */
  encryptionSecret: string;
};

/** Valida PKCS#12, cifra y escribe archivo; devuelve campos persistibles en BD. */
export async function encryptAndPersistCompanyCertificate(
  input: SaveCertificateInput,
): Promise<{
  certificateSalt: string;
  certificateEncPath: string;
  certificatePasswordEnc: string;
}> {
  const pass = input.p12Password ?? "";
  verifyPkcs12Password(input.p12Buffer, pass);

  const saltBuf = generateCertificateSalt();
  const { encryptedP12, encryptedPasswordPayload } = encryptCompanyCertificatePayload(
    input.encryptionSecret,
    input.companyId,
    saltBuf,
    input.p12Buffer,
    pass,
  );

  const dir = companySecureDir(input.uploadsRoot, input.companyId);
  await fs.mkdir(dir, { recursive: true });
  const absolute = path.join(dir, CERT_FILENAME);
  await fs.writeFile(absolute, encryptedP12);

  const rel = path.posix.join("companies", String(input.companyId), CERT_FILENAME);
  return {
    certificateSalt: saltBuf.toString("base64"),
    certificateEncPath: rel.replace(/\\/g, "/"),
    certificatePasswordEnc: encryptedPasswordPayload.toString("base64"),
  };
}

/** Elimina certificado guardado para la empresa y limpía campos. */
export async function removeStoredCompanyCertificate(
  uploadsRoot: string,
  companyId: number,
): Promise<void> {
  try {
    const abs = companyCertificateAbsolutePath(uploadsRoot, companyId);
    await fs.unlink(abs);
  } catch {
    /* ya no existe */
  }
}

export function companyHasCertificateRecord(c: Pick<Company, "certificateSalt" | "certificateEncPath" | "certificatePasswordEnc">): boolean {
  return Boolean(c.certificateSalt && c.certificateEncPath && c.certificatePasswordEnc);
}

/** Descarga y descifra .p12 y contraseña para firmado. */
export async function loadDecryptedPkcs12ForCompany(
  company: Pick<
    Company,
    "id" | "certificateSalt" | "certificateEncPath" | "certificatePasswordEnc"
  >,
  uploadsRoot: string,
  encryptionSecret: string,
): Promise<{ p12Buffer: Buffer; password: string } | null> {
  if (!companyHasCertificateRecord(company)) return null;

  try {
    const saltBuf = Buffer.from(company.certificateSalt!, "base64");
    const encAbs = path.isAbsolute(company.certificateEncPath!)
      ? company.certificateEncPath!
      : path.join(uploadsRoot, company.certificateEncPath!.replace(/^[/\\]/, ""));
    const encFile = await fs.readFile(encAbs);
    const encPwdBuf = Buffer.from(company.certificatePasswordEnc!, "base64");

    const { p12Buffer, password } = decryptCompanyP12Payload(
      encryptionSecret,
      company.id,
      saltBuf,
      encFile,
      encPwdBuf,
    );
    return { p12Buffer, password };
  } catch (e) {
    console.error("No se pudo descifrar certificado de empresa.", e);
    throw new Error(
      "No se pudo descifrar el certificado con esa clave. Verificá la clave de cifrado o volvé a subir el .p12 en Perfil de empresa.",
    );
  }
}
