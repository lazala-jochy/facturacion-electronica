import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { ECF_CONSUMO_RFCE_TOTAL_THRESHOLD_RD } from "../config/dgiiEcf.constants";
import { codigoSeguridadRfceDesdeSignedEcf, extractXmlTagValue } from "../utils/ecfXmlExtract";
import { buildEcfNumber, normalizeEcfTipo } from "../utils/ecfTipo";
import { signXmlWithP12Buffer } from "./signer";
import { validateEcfPayload, type EcfPayload, type RfcePayload } from "./validation";
import { refinePayloadForEcfTipo } from "./ecfTipoHandlers";
import { plantillaEcf32ConsumoIntegra } from "./xmlBuilder/plantillas/ecf32ConsumoIntegra";
import { plantillaRfce32 } from "./xmlBuilder/plantillas/rfce32";
import { submitSignedRfceWithTenantConfig } from "./dgiiEcfApi.service";
import { resolveP12ForEcf, type SubmitEcfErr } from "./ecf.service";

type CotizacionWithRelations = Prisma.CotizacionGetPayload<{
  include: { company: true; client: true; items: true };
}>;

const contactFromClient = (phone?: string | null, email?: string | null) => {
  if (phone?.trim() && email?.trim()) return `${phone.trim()} | ${email.trim()}`;
  return phone?.trim() || email?.trim() || undefined;
};

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
      indicadorBienServicio: item.itemType === "bien" ? "1" : "2",
      unitPrice: item.unitPrice,
      totalValue: item.totalValue,
    })),
    subtotal: cotizacion.subtotal,
    itbis: cotizacion.itbis,
    total: cotizacion.total,
    exento: cotizacion.exento,
    ecfTipo: cotizacion.ecfTipo,
    referenceEncf: cotizacion.ecfReferenceNcf?.trim() || undefined,
  };
  return refinePayloadForEcfTipo(base, cotizacion);
};

const toRfcePayload = (ecf: EcfPayload, codigoSeguridadeCF: string): RfcePayload => ({
  ecfNumber: ecf.ecfNumber,
  issueDate: ecf.issueDate,
  issuer: ecf.issuer,
  buyer: ecf.buyer,
  subtotal: ecf.subtotal,
  itbis: ecf.itbis,
  total: ecf.total,
  exento: ecf.exento,
  tipoPago: ecf.tipoPago,
  codigoSeguridadeCF,
});

export type ConsumoMenor250Pack = {
  ecf_number: string;
  codigo_seguridade_cf: string;
  integra_signed_xml: string;
  rfce_signed_xml: string;
};

export const CONSUMO_MENOR_250_RFCE_FLOW = "consumo_menor_250_rfce" as const;

type RfcePackMeta = {
  flow?: string;
  ecf_number?: string;
  codigo_seguridade_cf?: string;
  rfce_signed_xml?: string;
  integra_signed_xml?: string;
  stage?: string;
};

export function verifyRfcePackCodigoAlignment(pack: ConsumoMenor250Pack): void {
  const codigoRfce = extractXmlTagValue(pack.rfce_signed_xml, "CodigoSeguridadeCF");
  const codigoFromIntegra = codigoSeguridadRfceDesdeSignedEcf(pack.integra_signed_xml);
  if (codigoRfce !== codigoFromIntegra) {
    throw new Error(
      `RFCE CodigoSeguridadeCF (${codigoRfce}) no coincide con la firma del e-CF íntegro (${codigoFromIntegra}).`,
    );
  }
}

function parseRfcePackMeta(dgiiResponse: string | null | undefined): RfcePackMeta | null {
  if (!dgiiResponse?.trim()) return null;
  try {
    const parsed = JSON.parse(dgiiResponse) as RfcePackMeta;
    if (parsed.flow !== CONSUMO_MENOR_250_RFCE_FLOW) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** e-CF íntegro ya firmado (mismo que se usó al enviar el RFCE). */
export async function getStoredConsumoMenor250IntegraForDownload(
  cotizacionId: number,
  companyId: number,
): Promise<{ ecf_number: string; integra_signed_xml: string } | null> {
  const pack = await loadStoredConsumoMenor250Pack(cotizacionId, companyId);
  if (pack) {
    return { ecf_number: pack.ecf_number, integra_signed_xml: pack.integra_signed_xml };
  }

  const row = await prisma.cotizacion.findFirst({
    where: { id: cotizacionId, companyId },
    select: { signedXml: true, ecfTipo: true, total: true },
  });
  if (!row?.signedXml?.trim() || !cotizacionRequiereFlujoRfce32(row.ecfTipo, row.total)) {
    return null;
  }
  const integra = row.signedXml.trim();
  if (!/<ECF[\s>]/i.test(integra)) return null;
  const encf = extractXmlTagValue(integra, "eNCF");
  if (!encf) return null;
  return { ecf_number: encf, integra_signed_xml: integra };
}

export async function loadStoredConsumoMenor250Pack(
  cotizacionId: number,
  companyId: number,
): Promise<ConsumoMenor250Pack | null> {
  const row = await prisma.cotizacion.findFirst({
    where: { id: cotizacionId, companyId },
    select: { signedXml: true, dgiiResponse: true },
  });
  if (!row) return null;
  const meta = parseRfcePackMeta(row.dgiiResponse);
  const integra = row.signedXml?.trim() || meta?.integra_signed_xml?.trim() || "";
  const rfce = meta?.rfce_signed_xml?.trim() || "";
  const encf =
    meta?.ecf_number?.trim() ||
    extractXmlTagValue(integra, "eNCF") ||
    extractXmlTagValue(rfce, "eNCF");
  const codigo =
    meta?.codigo_seguridade_cf?.trim() ||
    (integra ? codigoSeguridadRfceDesdeSignedEcf(integra) : "") ||
    extractXmlTagValue(rfce, "CodigoSeguridadeCF");
  if (!integra || !rfce || !encf || codigo.length < 6) return null;
  const pack: ConsumoMenor250Pack = {
    ecf_number: encf,
    codigo_seguridade_cf: codigo,
    integra_signed_xml: integra,
    rfce_signed_xml: rfce,
  };
  verifyRfcePackCodigoAlignment(pack);
  return pack;
}

async function persistConsumoMenor250Pack(
  cotizacionId: number,
  pack: ConsumoMenor250Pack,
  extra: Record<string, unknown>,
): Promise<void> {
  verifyRfcePackCodigoAlignment(pack);
  const existing = await prisma.cotizacion.findUnique({
    where: { id: cotizacionId },
    select: { dgiiResponse: true },
  });
  let prev: RfcePackMeta = {};
  if (existing?.dgiiResponse?.trim()) {
    try {
      prev = JSON.parse(existing.dgiiResponse) as RfcePackMeta;
    } catch {
      prev = {};
    }
  }
  await prisma.cotizacion.update({
    where: { id: cotizacionId },
    data: {
      signedXml: pack.integra_signed_xml,
      dgiiResponse: JSON.stringify({
        ...prev,
        flow: CONSUMO_MENOR_250_RFCE_FLOW,
        ecf_number: pack.ecf_number,
        codigo_seguridade_cf: pack.codigo_seguridade_cf,
        rfce_signed_xml: pack.rfce_signed_xml,
        integra_signed_xml: pack.integra_signed_xml,
        ...extra,
      }),
    },
  });
}

/** Cotización tipo 32 con total &lt; RD$250k → flujo RFCE obligatorio en certificación. */
export function cotizacionRequiereFlujoRfce32(
  ecfTipo: string | null | undefined,
  total: number | null | undefined,
): boolean {
  const tipo = normalizeEcfTipo(ecfTipo ?? "");
  if (tipo !== "32") return false;
  return typeof total === "number" && Number.isFinite(total) && total < ECF_CONSUMO_RFCE_TOTAL_THRESHOLD_RD;
}

export async function submitConsumoMenor250RfceForCotizacion(
  cotizacionId: number,
  companyId: number,
  options: {
    uploadsRoot: string;
    certificateEncryptionSecret?: string;
    oneShotCertificate?: { buffer: Buffer; password: string };
  },
): Promise<
  | {
      ok: true;
      ecf_number: string;
      codigo_seguridade_cf: string;
      dgii_status: "accepted" | "rejected" | "pending";
      dgii_response: string;
    }
  | SubmitEcfErr
> {
  const packResult = await buildConsumoMenor250SignedPack(cotizacionId, companyId, {
    ...options,
    persist: true,
  });
  if (!packResult.ok) return packResult;

  const companyRow = await prisma.company.findUnique({ where: { id: companyId } });
  if (!companyRow) {
    return { ok: false, status: 404, message: "Empresa no encontrada." };
  }

  try {
    const dgiiResponse = await submitSignedRfceWithTenantConfig(
      companyRow,
      packResult.pack.rfce_signed_xml,
    );

    const dgiiStatus =
      dgiiResponse.status === "accepted"
        ? "accepted"
        : dgiiResponse.status === "rejected"
          ? "rejected"
          : "pending";

    await persistConsumoMenor250Pack(cotizacionId, packResult.pack, {
      stage: dgiiStatus === "accepted" ? "rfce_accepted" : "rfce_submitted",
      document_type: "RFCE",
      dgii_status: dgiiStatus,
      dgii_raw: dgiiResponse.rawResponse,
      http_status: dgiiResponse.httpStatus,
      integra_pending_portal_upload: dgiiStatus === "accepted",
      message:
        dgiiStatus === "accepted"
          ? "RFCE aceptado. Descargá el e-CF íntegro (mismo XML firmado) y subilo a «Facturas de consumo <250Mil»."
          : "RFCE enviado; revisá el estado en DGII.",
    });
    await prisma.cotizacion.update({
      where: { id: cotizacionId },
      data: {
        dgiiStatus,
        dgiiTrackId: dgiiResponse.trackId?.trim() || packResult.pack.ecf_number,
        dgiiSubmittedAt: new Date(),
      },
    });

    return {
      ok: true,
      ecf_number: packResult.pack.ecf_number,
      codigo_seguridade_cf: packResult.pack.codigo_seguridade_cf,
      dgii_status: dgiiStatus,
      dgii_response: dgiiResponse.rawResponse,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al enviar RFCE a DGII.";
    await persistConsumoMenor250Pack(cotizacionId, packResult.pack, {
      stage: "rfce_rejected",
      document_type: "RFCE",
      error: message,
    });
    await prisma.cotizacion.update({
      where: { id: cotizacionId },
      data: { dgiiStatus: "rejected" },
    });
    return {
      ok: false,
      status: 502,
      message,
      code: "RFCE_SUBMIT_FAILED",
    };
  }
}

export async function buildConsumoMenor250SignedPack(
  cotizacionId: number,
  companyId: number,
  options: {
    uploadsRoot: string;
    certificateEncryptionSecret?: string;
    oneShotCertificate?: { buffer: Buffer; password: string };
    /** Si true, siempre firma de nuevo (rompe el vínculo con RFCE ya enviado). */
    forceRegenerate?: boolean;
    /** Guarda el par RFCE+e-CF íntegro para descargas posteriores sin re-firmar. */
    persist?: boolean;
  },
): Promise<{ ok: true; pack: ConsumoMenor250Pack } | SubmitEcfErr> {
  if (!options.forceRegenerate) {
    const stored = await loadStoredConsumoMenor250Pack(cotizacionId, companyId);
    if (stored) {
      return { ok: true, pack: stored };
    }
  }

  const cotizacion = await prisma.cotizacion.findFirst({
    where: { id: cotizacionId, companyId },
    include: { company: true, client: true, items: { orderBy: { itemNumber: "asc" } } },
  });
  if (!cotizacion) {
    return { ok: false, status: 404, message: "Cotizacion no encontrada." };
  }

  const tipo = normalizeEcfTipo(cotizacion.ecfTipo);
  if (tipo !== "32") {
    return {
      ok: false,
      status: 400,
      message: "Solo aplica a cotizaciones tipo 32 (Factura de Consumo).",
      code: "NOT_CONSUMO_32",
    };
  }
  if (!Number.isFinite(cotizacion.total) || cotizacion.total >= ECF_CONSUMO_RFCE_TOTAL_THRESHOLD_RD) {
    return {
      ok: false,
      status: 400,
      message: `Solo aplica a facturas de consumo con total menor a RD$${ECF_CONSUMO_RFCE_TOTAL_THRESHOLD_RD.toLocaleString("es-DO")}.`,
      code: "NOT_CONSUMO_MENOR_250K",
    };
  }

  const payload = toPayload(cotizacion);
  const validation = validateEcfPayload(payload);
  if (!validation.valid) {
    return {
      ok: false,
      status: 400,
      message: "Validacion e-CF fallida.",
      errors: validation.errors,
    };
  }

  const companyRow = await prisma.company.findUnique({ where: { id: companyId } });
  if (!companyRow) {
    return { ok: false, status: 404, message: "Empresa no encontrada." };
  }

  const material = await resolveP12ForEcf(companyId, companyRow, options);
  if (!material.ok) return material;

  try {
    const integraXml = plantillaEcf32ConsumoIntegra(payload);
    if (/<\s*IndicadorEnvioDiferido\b/i.test(integraXml)) {
      return {
        ok: false,
        status: 500,
        message:
          "e-CF íntegro con IndicadorEnvioDiferido no corresponde al formato consumo <250k del lote Excel.",
      };
    }
    const monto = Number(extractXmlTagValue(integraXml, "MontoTotal").replace(/,/g, ""));
    if (!Number.isFinite(monto) || monto >= ECF_CONSUMO_RFCE_TOTAL_THRESHOLD_RD) {
      return {
        ok: false,
        status: 400,
        message: "MontoTotal debe ser menor a RD$250.000 para consumo íntegro.",
      };
    }
    const integraSignedXml = await signXmlWithP12Buffer(
      integraXml,
      material.p12Buf,
      material.passphrase,
    );

    const codigo = codigoSeguridadRfceDesdeSignedEcf(integraSignedXml);
    if (codigo.length < 6) {
      return {
        ok: false,
        status: 500,
        message: "No se pudo derivar CodigoSeguridadeCF del e-CF íntegro firmado.",
      };
    }

    const rfceXml = plantillaRfce32(toRfcePayload(payload, codigo));
    const rfceSignedXml = await signXmlWithP12Buffer(
      rfceXml,
      material.p12Buf,
      material.passphrase,
    );

    const pack: ConsumoMenor250Pack = {
      ecf_number: payload.ecfNumber,
      codigo_seguridade_cf: codigo,
      integra_signed_xml: integraSignedXml,
      rfce_signed_xml: rfceSignedXml,
    };
    verifyRfcePackCodigoAlignment(pack);

    if (options.persist) {
      await persistConsumoMenor250Pack(cotizacionId, pack, { stage: "pack_prepared" });
    }

    return { ok: true, pack };
  } catch (e) {
    return {
      ok: false,
      status: 400,
      message: e instanceof Error ? e.message : "Error al generar RFCE y e-CF íntegro.",
    };
  }
}
