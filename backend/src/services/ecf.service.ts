import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { submitEcfToDgii, type DgiiSubmissionResult } from "./dgiiService";
import { signXmlWithP12Buffer } from "./signer";
import { validateEcfPayload, type EcfPayload } from "./validation";
import { buildEcfXml } from "./xmlBuilder";
import { assertCertificateEncryptionSecret } from "../utils/companyCertificateCrypto";
import {
  companyHasCertificateRecord,
  encryptAndPersistCompanyCertificate,
  loadDecryptedPkcs12ForCompany,
} from "../utils/companyCertificateStorage";

const buildEcfNumber = (cotizacionNumber: number) => `E3100000000${String(cotizacionNumber).padStart(8, "0")}`;

const contactFromClient = (phone?: string | null, email?: string | null) => {
  if (phone?.trim() && email?.trim()) return `${phone.trim()} | ${email.trim()}`;
  return phone?.trim() || email?.trim() || undefined;
};

type CotizacionWithRelations = Prisma.CotizacionGetPayload<{
  include: { company: true; client: true; items: true };
}>;

const toPayload = (cotizacion: CotizacionWithRelations): EcfPayload => ({
  ecfNumber: buildEcfNumber(cotizacion.number),
  issueDate: cotizacion.createdAt,
  issuer: {
    rnc: cotizacion.company.rnc,
    name: cotizacion.company.name,
    address: cotizacion.company.address,
    phone: cotizacion.company.phone,
    email: cotizacion.company.email,
  },
  buyer: {
    name: cotizacion.client.name,
    rncCedula: cotizacion.client.rncCedula,
    address: cotizacion.client.address,
    contact: contactFromClient(cotizacion.client.phone, cotizacion.client.email),
  },
  items: cotizacion.items.map((item) => ({
    itemNumber: item.itemNumber,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice,
    totalValue: item.totalValue,
  })),
  subtotal: cotizacion.subtotal,
  itbis: cotizacion.itbis,
  total: cotizacion.total,
});

export type SubmitEcfErr = {
  ok: false;
  status: number;
  message: string;
  errors?: string[];
  code?: string;
};

export const ecfService = {
  async generateForCotizacion(cotizacionId: number, companyId: number) {
    const cotizacion = await prisma.cotizacion.findFirst({
      where: { id: cotizacionId, companyId },
      include: { company: true, client: true, items: { orderBy: { itemNumber: "asc" } } },
    });
    if (!cotizacion) {
      return {
        ok: false as const,
        status: 404,
        message: "Cotizacion no encontrada.",
      };
    }

    const payload = toPayload(cotizacion);
    const validation = validateEcfPayload(payload);
    if (!validation.valid) {
      return {
        ok: false as const,
        status: 400,
        message: "Validacion e-CF fallida.",
        errors: validation.errors,
      };
    }

    const xml = buildEcfXml(payload);
    await prisma.cotizacion.update({
      where: { id: cotizacionId },
      data: {
        dgiiStatus: "prepared",
        dgiiResponse: JSON.stringify({
          stage: "prepared",
          message: "XML e-CF generado y listo para envio.",
        }),
      },
    });
    return {
      ok: true as const,
      payload,
      xml,
    };
  },

  async submitForCotizacion(
    cotizacionId: number,
    companyId: number,
    options: {
      uploadsRoot: string;
      /** Frase que el usuario define al guardar el .p12; necesaria para descifrar en cada envío. */
      certificateEncryptionSecret?: string;
      /** Opcional en este POST: archivo .p12 + contraseña; se guarda cifrado y luego se firma. */
      oneShotCertificate?: { buffer: Buffer; password: string };
    },
  ): Promise<
    | { ok: true; xml: string; signedXml: string; dgiiResponse: DgiiSubmissionResult }
    | SubmitEcfErr
  > {
    const generation = await this.generateForCotizacion(cotizacionId, companyId);
    if (!generation.ok) return generation;

    try {
      let companyRow = await prisma.company.findUnique({ where: { id: companyId } });
      if (!companyRow) {
        return { ok: false, status: 404, message: "Empresa no encontrada." };
      }

      const secretRaw = options.certificateEncryptionSecret?.trim() ?? "";

      if (options.oneShotCertificate?.buffer?.length) {
        const pwd = options.oneShotCertificate.password?.trim() ?? "";
        if (!pwd) {
          return {
            ok: false,
            status: 400,
            message: "Indicá la contraseña del certificado (.p12) para guardarlo y enviar.",
          };
        }
        let encSecret: string;
        try {
          encSecret = assertCertificateEncryptionSecret(secretRaw);
        } catch (e) {
          return {
            ok: false,
            status: 400,
            message:
              e instanceof Error
                ? e.message
                : "Indicá una clave de cifrado de al menos 8 caracteres (la usarás cada vez que envíes e-CF).",
          };
        }
        const persisted = await encryptAndPersistCompanyCertificate({
          uploadsRoot: options.uploadsRoot,
          companyId,
          p12Buffer: options.oneShotCertificate.buffer,
          p12Password: pwd,
          encryptionSecret: encSecret,
        });
        await prisma.company.update({
          where: { id: companyId },
          data: {
            certificateSalt: persisted.certificateSalt,
            certificateEncPath: persisted.certificateEncPath,
            certificatePasswordEnc: persisted.certificatePasswordEnc,
          },
        });
        companyRow = await prisma.company.findUnique({ where: { id: companyId } });
        if (!companyRow) {
          return { ok: false, status: 404, message: "Empresa no encontrada." };
        }
      }

      if (!companyHasCertificateRecord(companyRow)) {
        return {
          ok: false,
          status: 428,
          code: "CERTIFICATE_REQUIRED",
          message:
            "Tu empresa no tiene certificado DGII configurado. Subí un archivo .p12 o .pfx y su contraseña para firmar antes de enviar.",
        };
      }

      let encryptionSecret: string;
      try {
        encryptionSecret = assertCertificateEncryptionSecret(secretRaw);
      } catch (e) {
        return {
          ok: false,
          status: 400,
          message:
            e instanceof Error
              ? e.message
              : "Indicá la clave de cifrado del certificado (la definiste al guardar el .p12).",
        };
      }

      let p12Buf: Buffer;
      let passphrase: string;
      try {
        const loaded = await loadDecryptedPkcs12ForCompany(
          companyRow,
          options.uploadsRoot,
          encryptionSecret,
        );
        if (!loaded) {
          return {
            ok: false,
            status: 428,
            code: "CERTIFICATE_REQUIRED",
            message:
              "Tu empresa no tiene certificado DGII configurado. Subí un archivo .p12 o .pfx y su contraseña para firmar antes de enviar.",
          };
        }
        p12Buf = loaded.p12Buffer;
        passphrase = loaded.password;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "No se pudo usar el certificado digital.";
        const looksLikeWrongKey =
          msg.includes("descifrar") || msg.includes("clave") || msg.includes("cifrado");
        return {
          ok: false,
          status: looksLikeWrongKey ? 400 : 500,
          message: msg,
        };
      }

      const signedXml = await signXmlWithP12Buffer(generation.xml, p12Buf, passphrase);

      let dgiiResponse: DgiiSubmissionResult;
      try {
        dgiiResponse = await submitEcfToDgii(signedXml);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error de red al enviar a DGII.";
        return {
          ok: false,
          status: 503,
          message: `No se pudo enviar a DGII. Verifica la conexion a internet. (${message})`,
        };
      }

      await prisma.cotizacion.update({
        where: { id: cotizacionId },
        data: {
          signedXml,
          dgiiTrackId: dgiiResponse.trackId,
          dgiiStatus: dgiiResponse.status,
          dgiiResponse: dgiiResponse.rawResponse,
          dgiiSubmittedAt: new Date(),
        },
      });

      return {
        ok: true,
        xml: generation.xml,
        signedXml,
        dgiiResponse,
      };
    } catch (e) {
      return {
        ok: false,
        status: 400,
        message: e instanceof Error ? e.message : "Error al preparar firma XML.",
      };
    }
  },
};
