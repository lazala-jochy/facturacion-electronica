import type { Company } from "@prisma/client";
import { assertCertificateEncryptionSecret } from "../utils/companyCertificateCrypto";
import {
  companyHasCertificateRecord,
  loadDecryptedPkcs12ForCompany,
} from "../utils/companyCertificateStorage";
import { getUploadsRoot } from "../utils/uploadsRoot";

export type CompanySigningMaterial = {
  p12Buffer: Buffer;
  passphrase: string;
};

export async function loadCompanySigningMaterial(
  company: Pick<
    Company,
    "id" | "certificateSalt" | "certificateEncPath" | "certificatePasswordEnc" | "certificateKeyphrase"
  >,
  uploadsRoot = getUploadsRoot(),
): Promise<CompanySigningMaterial | null> {
  if (!companyHasCertificateRecord(company)) return null;
  const encryptionSecret = assertCertificateEncryptionSecret(
    typeof company.certificateKeyphrase === "string" ? company.certificateKeyphrase : "",
  );
  const loaded = await loadDecryptedPkcs12ForCompany(company, uploadsRoot, encryptionSecret);
  if (!loaded) return null;
  return { p12Buffer: loaded.p12Buffer, passphrase: loaded.password };
}
