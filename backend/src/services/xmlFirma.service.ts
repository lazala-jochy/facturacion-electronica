import { prisma } from "../prisma";
import { loadCompanySigningMaterial } from "../commercial-approvals/companySigning";
import { signXmlWithP12Buffer } from "./signer";

export type SignUploadedXmlResult =
  | { ok: true; signedXml: string }
  | { ok: false; status: number; message: string };

/** Firma cualquier XML (no necesariamente un e-CF) con el certificado ya configurado de la empresa. */
export async function signUploadedXml(
  companyId: number,
  xmlBuffer: Buffer,
): Promise<SignUploadedXmlResult> {
  const xml = xmlBuffer.toString("utf8").trim();
  if (!xml) {
    return { ok: false, status: 400, message: "El archivo XML está vacío." };
  }
  if (!xml.startsWith("<")) {
    return { ok: false, status: 400, message: "El archivo no parece ser un XML válido." };
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    return { ok: false, status: 404, message: "Empresa no encontrada." };
  }

  const signing = await loadCompanySigningMaterial(company);
  if (!signing) {
    return {
      ok: false,
      status: 503,
      message: "Certificado DGII no configurado para esta empresa. Subilo en Perfil de empresa.",
    };
  }

  try {
    const signedXml = signXmlWithP12Buffer(xml, signing.p12Buffer, signing.passphrase);
    return { ok: true, signedXml };
  } catch (e) {
    return {
      ok: false,
      status: 400,
      message: e instanceof Error ? e.message : "No se pudo firmar el XML.",
    };
  }
}
