import type { Company, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import type { DgiiSubmissionResult } from "../types/dgiiEcf";
import { DgiiEcfError } from "../types/dgiiEcf";
import { consultDgiiTrackId, submitSignedEcfWithTenantConfig } from "./dgiiEcfApi.service";
import { finalizeDgiiSubmissionAfterReception } from "./dgiiSubmissionFinalize.service";
import { signXmlWithP12Buffer } from "./signer";
import { validateEcfPayload, type EcfPayload } from "./validation";
import { buildEcfXml } from "./xmlBuilder";
import { assertCertificateEncryptionSecret } from "../utils/companyCertificateCrypto";
import { buildEcfNumber } from "../utils/ecfTipo";
import { refinePayloadForEcfTipo } from "./ecfTipoHandlers";
import { persistRepresentacionImpresa } from "./ecfRepresentacionImpresa.service";
import {
  companyHasCertificateRecord,
  encryptAndPersistCompanyCertificate,
  loadDecryptedPkcs12ForCompany,
} from "../utils/companyCertificateStorage";
import { normalizeEcfTipo } from "../utils/ecfTipo";
import { parseDgiiCertProfile, type DgiiCertProfile } from "../types/dgiiCertProfile";
import { ECF_CONSUMO_RFCE_TOTAL_THRESHOLD_RD } from "../config/dgiiEcf.constants";
import { mapDgiiRawBodyToCotizacionEstado } from "../utils/dgiiEstadoRecepcion";
import { isDgiiSequenceRejection } from "../utils/dgiiRejection";
import {
  ensureCotizacionSeqAdvancedAfterSequenceReject,
  persistCotizacionAfterDgiiSubmission,
  validateCotizacionDgiiResubmit,
} from "./cotizacion.service";

const contactFromClient = (phone?: string | null, email?: string | null) => {
  if (phone?.trim() && email?.trim()) return `${phone.trim()} | ${email.trim()}`;
  return phone?.trim() || email?.trim() || undefined;
};

type CotizacionWithRelations = Prisma.CotizacionGetPayload<{
  include: { company: true; client: true; items: true };
}>;

const toPayload = (cotizacion: CotizacionWithRelations): EcfPayload => {
  const ncfSeq =
    Number.isFinite(cotizacion.ecfNcfSeq) && cotizacion.ecfNcfSeq > 0
      ? cotizacion.ecfNcfSeq
      : cotizacion.number;
  const base: EcfPayload = {
    ecfNumber: buildEcfNumber(cotizacion.ecfTipo, ncfSeq),
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
    ecfTipo: cotizacion.ecfTipo,
    referenceEncf: cotizacion.ecfReferenceNcf?.trim() || undefined,
  };
  return refinePayloadForEcfTipo(base, cotizacion);
};

export type SubmitEcfErr = {
  ok: false;
  status: number;
  message: string;
  errors?: string[];
  code?: string;
};

/** Certificado .p12 descifrado listo para firmar e-CF (reutilizado en envío DGII y firma local). */
async function resolveP12ForEcf(
  companyId: number,
  initialCompany: Company,
  options: {
    uploadsRoot: string;
    certificateEncryptionSecret?: string;
    oneShotCertificate?: { buffer: Buffer; password: string };
  },
): Promise<
  { ok: true; companyRow: Company; p12Buf: Buffer; passphrase: string } | SubmitEcfErr
> {
  let companyRow = initialCompany;
  const secretRaw =
    (options.certificateEncryptionSecret?.trim() || companyRow.certificateKeyphrase?.trim() || "") ?? "";

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
        certificateKeyphrase: encSecret,
      },
    });
    const reloaded = await prisma.company.findUnique({ where: { id: companyId } });
    if (!reloaded) {
      return { ok: false, status: 404, message: "Empresa no encontrada." };
    }
    companyRow = reloaded;
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
    return {
      ok: true,
      companyRow,
      p12Buf: loaded.p12Buffer,
      passphrase: loaded.password,
    };
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
}

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
    const preserveDgiiRejection =
      cotizacion.dgiiStatus === "rejected" && Boolean(cotizacion.dgiiResponse?.trim());
    await prisma.cotizacion.update({
      where: { id: cotizacionId },
      data: {
        dgiiStatus: "prepared",
        ...(preserveDgiiRejection
          ? {}
          : {
              dgiiResponse: JSON.stringify({
                stage: "prepared",
                message: "XML e-CF generado y listo para envio.",
              }),
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
      /** Certificación: `paso2` vs `paso4` (URLs distintas en perfil). */
      certProfile?: unknown;
    },
  ): Promise<
    | {
        ok: true;
        xml: string;
        signedXml: string;
        dgiiResponse: DgiiSubmissionResult;
        newEcfNcfSeq?: number;
      }
    | SubmitEcfErr
  > {
    const cotGate = await prisma.cotizacion.findFirst({
      where: { id: cotizacionId, companyId },
      select: { dgiiStatus: true, dgiiResponse: true },
    });
    if (!cotGate) {
      return { ok: false, status: 404, message: "Cotizacion no encontrada." };
    }
    const resubmitGate = validateCotizacionDgiiResubmit(cotGate);
    if (!resubmitGate.allowed) {
      return {
        ok: false,
        status: resubmitGate.status,
        message: resubmitGate.message,
        code: resubmitGate.code,
      };
    }

    await ensureCotizacionSeqAdvancedAfterSequenceReject(cotizacionId, companyId);

    const generation = await this.generateForCotizacion(cotizacionId, companyId);
    if (!generation.ok) return generation;

    try {
      let companyRow = await prisma.company.findUnique({ where: { id: companyId } });
      if (!companyRow) {
        return { ok: false, status: 404, message: "Empresa no encontrada." };
      }

      const allowDirectConsumoMenor250k =
        process.env.DGII_ALLOW_DIRECT_ECF32_UNDER_250K?.trim() === "1";
      const isProduccion = (companyRow.dgiiEnvironment ?? "CERTIFICACION") === "PRODUCCION";
      const tipoGen = normalizeEcfTipo(generation.payload.ecfTipo);
      const totalGen = generation.payload.total;
      if (
        !allowDirectConsumoMenor250k &&
        !isProduccion &&
        tipoGen === "32" &&
        Number.isFinite(totalGen) &&
        totalGen < ECF_CONSUMO_RFCE_TOTAL_THRESHOLD_RD
      ) {
        return {
          ok: false,
          status: 422,
          code: "CONSUMO_MENOR_250K_RFCE",
          message:
            "En certificación DGII, la Factura de Consumo (32) con total menor a RD$250.000 debe presentarse primero como RFCE (Resumen de Factura de Consumo) al servicio de recepción de resúmenes. Con los resúmenes aceptados, cargá los e-CF completos por la interfaz de pruebas. Usá el flujo por lote Excel (RFCE firmados + e-CF), no el envío directo desde esta cotización. Opcional en desarrollo: DGII_ALLOW_DIRECT_ECF32_UNDER_250K=1.",
        };
      }

      const material = await resolveP12ForEcf(companyId, companyRow, {
        uploadsRoot: options.uploadsRoot,
        certificateEncryptionSecret: options.certificateEncryptionSecret,
        oneShotCertificate: options.oneShotCertificate,
      });
      if (!material.ok) return material;
      companyRow = material.companyRow;

      const signedXml = await signXmlWithP12Buffer(
        generation.xml,
        material.p12Buf,
        material.passphrase,
      );

      let dgiiResponse: DgiiSubmissionResult;
      const certProfile = parseDgiiCertProfile(options.certProfile);
      try {
        const reception = await submitSignedEcfWithTenantConfig(companyRow, signedXml, {
          certProfile,
        });
        dgiiResponse = await finalizeDgiiSubmissionAfterReception(companyRow, reception, {
          certProfile,
        });
      } catch (error) {
        if (error instanceof DgiiEcfError) {
          const st =
            error.code === "MISSING_CREDENTIALS" || error.code === "TOKEN_PARSE"
              ? 400
              : error.code === "AUTH_FAILED" || error.code === "RECEPTION_FAILED" || error.code === "CONSULT_FAILED"
                ? error.httpStatus && error.httpStatus >= 400 && error.httpStatus < 600
                  ? error.httpStatus
                  : 502
                : 502;
          return {
            ok: false,
            status: st,
            message: error.message,
            code: error.code,
          };
        }
        const message =
          error instanceof Error ? error.message : "Error desconocido al llamar al servicio DGII.";
        return {
          ok: false,
          status: 502,
          message,
        };
      }

      const dgiiSubmittedAt = new Date();
      const persistResult = await persistCotizacionAfterDgiiSubmission(
        cotizacionId,
        companyId,
        generation.payload.ecfTipo ?? "31",
        {
          dgiiResponse,
          signedXml,
          dgiiSubmittedAt,
        },
      );

      if (dgiiResponse.status !== "rejected") {
        try {
          await persistRepresentacionImpresa({
            uploadsRoot: options.uploadsRoot,
            cotizacionId,
            company: {
              id: companyRow.id,
              dgiiEnvironment: companyRow.dgiiEnvironment,
              name: companyRow.name,
            },
            signedXml,
            ecfTipo: normalizeEcfTipo(generation.payload.ecfTipo),
            fechaFirma: dgiiSubmittedAt,
            dgiiTrackId: dgiiResponse.trackId ?? null,
          });
        } catch (riErr) {
          console.error("[ecf] representacion impresa:", riErr);
        }
      }

      return {
        ok: true,
        xml: generation.xml,
        signedXml,
        dgiiResponse,
        newEcfNcfSeq: persistResult.newSeq,
      };
    } catch (e) {
      return {
        ok: false,
        status: 400,
        message: e instanceof Error ? e.message : "Error al preparar firma XML.",
      };
    }
  },

  /**
   * Genera, firma y persiste `signed_xml` en la cotización (sin llamar a DGII).
   * Deja el comprobante listo para recepción con el mismo pipeline de firma que el envío.
   */
  async signAndStoreDraftForCotizacion(
    cotizacionId: number,
    companyId: number,
    options: {
      uploadsRoot: string;
      certificateEncryptionSecret?: string;
      oneShotCertificate?: { buffer: Buffer; password: string };
    },
  ): Promise<{ ok: true } | SubmitEcfErr> {
    await ensureCotizacionSeqAdvancedAfterSequenceReject(cotizacionId, companyId);
    const generation = await this.generateForCotizacion(cotizacionId, companyId);
    if (!generation.ok) return generation;

    try {
      const companyRowInitial = await prisma.company.findUnique({ where: { id: companyId } });
      if (!companyRowInitial) {
        return { ok: false, status: 404, message: "Empresa no encontrada." };
      }

      const material = await resolveP12ForEcf(companyId, companyRowInitial, options);
      if (!material.ok) return material;

      const signedXml = await signXmlWithP12Buffer(
        generation.xml,
        material.p12Buf,
        material.passphrase,
      );

      await prisma.cotizacion.update({
        where: { id: cotizacionId },
        data: {
          signedXml,
          dgiiStatus: "prepared",
          dgiiResponse: JSON.stringify({
            stage: "ecf_signed",
            message: "e-CF firmado; listo para recepción DGII.",
          }),
        },
      });

      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        status: 400,
        message: e instanceof Error ? e.message : "Error al firmar y guardar el e-CF.",
      };
    }
  },

  /**
   * Firma el e-CF con el certificado de la empresa sin llamar a DGII ni guardar `signed_xml` en la cotización.
   * Útil para descargar el XML con `Signature` (formato exigido) antes o sin envío.
   */
  async signEcfXmlForCotizacion(
    cotizacionId: number,
    companyId: number,
    options: {
      uploadsRoot: string;
      certificateEncryptionSecret?: string;
      oneShotCertificate?: { buffer: Buffer; password: string };
    },
  ): Promise<{ ok: true; signedXml: string; ecf_number: string } | SubmitEcfErr> {
    const generation = await this.generateForCotizacion(cotizacionId, companyId);
    if (!generation.ok) return generation;

    try {
      const companyRowInitial = await prisma.company.findUnique({ where: { id: companyId } });
      if (!companyRowInitial) {
        return { ok: false, status: 404, message: "Empresa no encontrada." };
      }

      const material = await resolveP12ForEcf(companyId, companyRowInitial, {
        uploadsRoot: options.uploadsRoot,
        certificateEncryptionSecret: options.certificateEncryptionSecret,
        oneShotCertificate: options.oneShotCertificate,
      });
      if (!material.ok) return material;

      const signedXml = await signXmlWithP12Buffer(
        generation.xml,
        material.p12Buf,
        material.passphrase,
      );

      return {
        ok: true,
        signedXml,
        ecf_number: generation.payload.ecfNumber,
      };
    } catch (e) {
      return {
        ok: false,
        status: 400,
        message: e instanceof Error ? e.message : "Error al firmar el XML del e-CF.",
      };
    }
  },

  async consultDgiiForCotizacion(
    cotizacionId: number,
    companyId: number,
    options?: { certProfile?: DgiiCertProfile },
  ) {
    const row = await prisma.cotizacion.findFirst({
      where: { id: cotizacionId, companyId },
      include: { company: true },
    });
    if (!row) {
      return { ok: false as const, status: 404, message: "Cotizacion no encontrada." };
    }
    const trackId = row.dgiiTrackId?.trim();
    if (!trackId) {
      return {
        ok: false as const,
        status: 400,
        message: "Esta cotizacion no tiene trackId DGII. Enviá primero el e-CF.",
      };
    }
    try {
      const out = await consultDgiiTrackId(row.company, trackId, {
        certProfile: options?.certProfile,
      });
      const body =
        out.body.length > 12000 ? `${out.body.slice(0, 12000)}…` : out.body;
      const nextStatus = mapDgiiRawBodyToCotizacionEstado(body);
      let newEcfNcfSeq: number | undefined;

      if (nextStatus === "rejected" || nextStatus === "accepted") {
        const persistResult = await persistCotizacionAfterDgiiSubmission(
          cotizacionId,
          companyId,
          row.ecfTipo,
          {
            dgiiResponse: {
              status: nextStatus,
              trackId,
              rawResponse: body,
              accepted: nextStatus === "accepted",
            },
            signedXml: row.signedXml ?? "",
            dgiiSubmittedAt: row.dgiiSubmittedAt ?? new Date(),
          },
        );
        newEcfNcfSeq = persistResult.newSeq;
      } else {
        await prisma.cotizacion.update({
          where: { id: cotizacionId },
          data: {
            dgiiResponse: body,
            ...(nextStatus ? { dgiiStatus: nextStatus } : {}),
          },
        });
      }

      const cotAfter = await prisma.cotizacion.findFirst({
        where: { id: cotizacionId, companyId },
        select: { ecfTipo: true, ecfNcfSeq: true, dgiiStatus: true },
      });

      return {
        ok: true as const,
        http_status: out.httpStatus,
        dgii_response: body,
        dgii_status: cotAfter?.dgiiStatus ?? nextStatus ?? row.dgiiStatus ?? null,
        ...(newEcfNcfSeq != null && newEcfNcfSeq > 0
          ? {
              ecf_ncf_seq: newEcfNcfSeq,
              ecf_number: buildEcfNumber(cotAfter?.ecfTipo ?? row.ecfTipo, newEcfNcfSeq),
            }
          : cotAfter?.ecfNcfSeq && cotAfter.ecfNcfSeq > 0
            ? {
                ecf_ncf_seq: cotAfter.ecfNcfSeq,
                ecf_number: buildEcfNumber(cotAfter.ecfTipo, cotAfter.ecfNcfSeq),
              }
            : {}),
        ...(nextStatus === "rejected" && isDgiiSequenceRejection(body)
          ? { dgii_resubmit_new_seq: true }
          : {}),
      };
    } catch (e) {
      if (e instanceof DgiiEcfError) {
        return {
          ok: false as const,
          status: e.httpStatus && e.httpStatus >= 400 && e.httpStatus < 600 ? e.httpStatus : 502,
          message: e.message,
          code: e.code,
        };
      }
      return {
        ok: false as const,
        status: 502,
        message: e instanceof Error ? e.message : "Error al consultar DGII.",
      };
    }
  },
};
