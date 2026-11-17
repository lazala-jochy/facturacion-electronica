import fs from "node:fs/promises";
import path from "path";
import type { Company } from "@prisma/client";
import {
  decryptCompanyP12Payload,
  encryptCompanyCertificatePayload,
  generateCertificateSalt,
  verifyPkcs12Password,
} from "./companyCertificateCrypto";
import {
  certificateBucketObjectPath,
  downloadCertificateFromBucket,
  isCertificateBucketConfigured,
  removeCertificateFromBucket,
  uploadCertificateToBucket,
} from "./companyCertificateBucket";

const CERT_FILENAME = "company-certificate.enc";
/** Prefijo que marca `certificateEncPath` como objeto del bucket en vez de ruta local. */
const BUCKET_MARKER = "supabase:";

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

  const uploadedToBucket = await uploadCertificateToBucket(input.companyId, CERT_FILENAME, encryptedP12);

  let certificateEncPath: string;
  if (uploadedToBucket) {
    certificateEncPath = `${BUCKET_MARKER}${certificateBucketObjectPath(input.companyId, CERT_FILENAME)}`;
  } else {
    /** Sin SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY configuradas (ej. dev local): disco como antes. */
    const dir = companySecureDir(input.uploadsRoot, input.companyId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, CERT_FILENAME), encryptedP12);
    certificateEncPath = path.posix.join("companies", String(input.companyId), CERT_FILENAME).replace(/\\/g, "/");
  }

  return {
    certificateSalt: saltBuf.toString("base64"),
    certificateEncPath,
    certificatePasswordEnc: encryptedPasswordPayload.toString("base64"),
  };
}

/** Elimina certificado guardado para la empresa (bucket y/o disco) y limpía campos. */
export async function removeStoredCompanyCertificate(
  uploadsRoot: string,
  companyId: number,
): Promise<void> {
  if (isCertificateBucketConfigured()) {
    await removeCertificateFromBucket(certificateBucketObjectPath(companyId, CERT_FILENAME));
  }
  try {
    const abs = companyCertificateAbsolutePath(uploadsRoot, companyId);
    await fs.unlink(abs);
  } catch {
    /* ya no existe en disco (o nunca estuvo ahí) */
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
    const encPath = company.certificateEncPath!;
    const encFile = encPath.startsWith(BUCKET_MARKER)
      ? await downloadCertificateFromBucket(encPath.slice(BUCKET_MARKER.length))
      : await fs.readFile(
          path.isAbsolute(encPath) ? encPath : path.join(uploadsRoot, encPath.replace(/^[/\\]/, "")),
        );
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
