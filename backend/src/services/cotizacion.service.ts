import type { Prisma } from "@prisma/client";
import { ECF_NCF_SEQ_EXCEEDED_MESSAGE } from "../config/dgiiEcf.constants";
import { prisma } from "../prisma";
import {
  calculateTotalsFromItems,
  itemLineTotalValue,
} from "../utils/tax";
import type { DgiiSubmissionResult } from "../types/dgiiEcf";
import { normalizeEcfTipo } from "../utils/ecfTipo";
import { extractEncfFromDgiiResponse, isDgiiSequenceRejection } from "../utils/dgiiRejection";
import {
  allocateNextAfterUsedSeq,
  allocateNextEcfNcfSeq,
  markEcfNcfSeqUsed,
} from "./ecfSeq.service";
import { isValidPhoneFormat } from "../utils/validation";
import { validateCotizacionEcfBusiness } from "./ecfTipoHandlers";

export type IncomingItem = {
  quantity: number;
  unit: string;
  description: string;
  unit_price: number;
};

export type CreateClientWithCotizacionInput = {
  client: {
    name: string;
    address?: string | null;
    rnc_cedula: string;
    phone?: string | null;
    email?: string | null;
  };
  cotizacion: {
    payment_terms: string;
    payment_method?: string | null;
    account_manager: string;
    comment?: string | null;
    document_title?: string | null;
    fiscal_legend?: string | null;
    ecf_tipo?: string | null;
    ecf_reference_ncf?: string | null;
    calc_mode?: "auto" | "manual";
    subtotal?: number;
    itbis?: number;
    total?: number;
  };
  items?: IncomingItem[];
};
export type UpdateCotizacionInput = CreateClientWithCotizacionInput;

const trimOrNull = (v: string | undefined | null) => {
  if (v == null) return null;
  const t = v.trim();
  return t.length ? t : null;
};
const toDocDigits = (value: string) => value.replace(/\D/g, "");
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Error name (no subclass) para detectar límite DGII sin acoplar mensajes en distintos idiomas. */
export const ECF_NCF_SEQ_EXCEEDED_ERROR_NAME = "EcfNcfSeqExceededError";

const allocateEcfNcfSeq = allocateNextEcfNcfSeq;

export type DgiiResubmitGuardResult =
  | { allowed: true }
  | { allowed: false; status: number; message: string; code: string };

/**
 * Solo permite reenvío directo a DGII si el último estado lo permite.
 * Rechazo distinto de «secuencia ya utilizada» exige editar y guardar la cotización antes.
 */
export function validateCotizacionDgiiResubmit(cot: {
  dgiiStatus: string | null;
  dgiiResponse: string | null;
}): DgiiResubmitGuardResult {
  const status = cot.dgiiStatus?.trim() ?? "";

  if (status === "accepted") {
    return {
      allowed: false,
      status: 409,
      message: "Este comprobante ya fue aceptado por DGII.",
      code: "DGII_ALREADY_ACCEPTED",
    };
  }

  if (status === "pending") {
    return {
      allowed: false,
      status: 409,
      message:
        "El envío está pendiente en DGII. Consultá el estado por Track ID antes de volver a enviar.",
      code: "DGII_PENDING",
    };
  }

  if (status === "submit_queued" || status === "submitting") {
    return {
      allowed: false,
      status: 409,
      message:
        "El comprobante está en cola de envío a DGII (reintento automático). Esperá unos minutos o usá «Reintentar envío».",
      code: "DGII_SUBMIT_QUEUED",
    };
  }

  if (status === "submit_failed") {
    return { allowed: true };
  }

  if (status === "rejected" && !isDgiiSequenceRejection(cot.dgiiResponse)) {
    return {
      allowed: false,
      status: 409,
      message:
        "DGII rechazó por un error distinto a «secuencia ya utilizada». Editá y guardá la cotización; después usá «Enviar DGII». «Reenviar» solo aplica cuando DGII indica secuencia ya utilizada.",
      code: "DGII_REJECT_NOT_SEQUENCE",
    };
  }

  return { allowed: true };
}

/**
 * Si el último envío fue rechazado por secuencia ya usada y el correlativo en BD no avanzó,
 * sube a la siguiente secuencia libre antes de generar/firmar de nuevo.
 */
export async function ensureCotizacionSeqAdvancedAfterSequenceReject(
  cotizacionId: number,
  companyId: number,
): Promise<{ advanced: boolean; newSeq?: number }> {
  const cot = await prisma.cotizacion.findFirst({
    where: { id: cotizacionId, companyId },
    select: {
      ecfNcfSeq: true,
      ecfTipo: true,
      dgiiStatus: true,
      dgiiResponse: true,
    },
  });
  if (!cot || cot.dgiiStatus !== "rejected") return { advanced: false };

  const tipo = normalizeEcfTipo(cot.ecfTipo);
  const raw = cot.dgiiResponse?.trim() ?? "";

  const advanceToNext = async (usedSeq: number) => {
    const newSeq = await prisma.$transaction(async (tx) => {
      if (usedSeq > 0) {
        await markEcfNcfSeqUsed(tx, companyId, tipo, usedSeq);
      }
      const next = await allocateNextAfterUsedSeq(tx, companyId, tipo, usedSeq, {
        excludeCotizacionId: cotizacionId,
      });
      await tx.cotizacion.update({
        where: { id: cotizacionId },
        data: { ecfNcfSeq: next, signedXml: null },
      });
      return next;
    });
    return { advanced: true as const, newSeq };
  };

  if (raw && isDgiiSequenceRejection(raw)) {
    const fromEncf = extractEncfFromDgiiResponse(raw);
    const encfSeq =
      fromEncf && fromEncf.tipo === tipo ? fromEncf.seq : fromEncf?.seq ?? 0;
    const usedSeq = Math.max(cot.ecfNcfSeq > 0 ? cot.ecfNcfSeq : 0, encfSeq);
    if (usedSeq < 1) return { advanced: false };
    if (cot.ecfNcfSeq > usedSeq) return { advanced: false };
    return advanceToNext(usedSeq);
  }

  return { advanced: false };
}

/**
 * Persiste el resultado de recepción DGII. Si el estado es **rejected** y el cuerpo indica
 * **rechazo por secuencia/correlativo** (`isDgiiSequenceRejection`), se asigna el siguiente `ecfNcfSeq`
 * y se borra el XML firmado. Si es rechazo por otra causa, se conserva `ecfNcfSeq` y solo se borra
 * `signed_xml` para forzar regeneración con la plantilla actual.
 */
export async function persistCotizacionAfterDgiiSubmission(
  cotizacionId: number,
  companyId: number,
  ecfTipo: string,
  args: {
    dgiiResponse: DgiiSubmissionResult;
    signedXml: string;
    dgiiSubmittedAt: Date;
  },
): Promise<{ newSeq?: number }> {
  const tipo = normalizeEcfTipo(ecfTipo);
  const { dgiiResponse, signedXml, dgiiSubmittedAt } = args;

  return prisma.$transaction(async (tx) => {
    const cotRow = await tx.cotizacion.findFirst({
      where: { id: cotizacionId, companyId },
      select: { ecfNcfSeq: true },
    });

    const sequenceReject = isDgiiSequenceRejection(dgiiResponse.rawResponse);

    if (dgiiResponse.status === "rejected") {
      if (sequenceReject) {
        const fromEncf = extractEncfFromDgiiResponse(dgiiResponse.rawResponse);
        const encfSeq =
          fromEncf && fromEncf.tipo === tipo ? fromEncf.seq : fromEncf?.seq ?? 0;
        const cotSeq = cotRow?.ecfNcfSeq && cotRow.ecfNcfSeq > 0 ? cotRow.ecfNcfSeq : 0;
        const usedSeq = Math.max(cotSeq, encfSeq);
        if (usedSeq > 0) {
          await markEcfNcfSeqUsed(tx, companyId, tipo, usedSeq);
        }
        const newSeq =
          usedSeq > 0
            ? await allocateNextAfterUsedSeq(tx, companyId, tipo, usedSeq, {
                excludeCotizacionId: cotizacionId,
              })
            : await allocateEcfNcfSeq(tx, companyId, tipo);
        await tx.cotizacion.update({
          where: { id: cotizacionId },
          data: {
            signedXml: null,
            dgiiTrackId: dgiiResponse.trackId,
            dgiiStatus: dgiiResponse.status,
            dgiiResponse: dgiiResponse.rawResponse,
            dgiiSubmittedAt,
            ecfNcfSeq: newSeq,
          },
        });
        return { newSeq };
      }

      await tx.cotizacion.update({
        where: { id: cotizacionId },
        data: {
          signedXml: null,
          dgiiTrackId: dgiiResponse.trackId,
          dgiiStatus: dgiiResponse.status,
          dgiiResponse: dgiiResponse.rawResponse,
          dgiiSubmittedAt,
        },
      });
      return {};
    }

    if (cotRow?.ecfNcfSeq && cotRow.ecfNcfSeq > 0) {
      await markEcfNcfSeqUsed(tx, companyId, tipo, cotRow.ecfNcfSeq);
    }

    await tx.cotizacion.update({
      where: { id: cotizacionId },
      data: {
        signedXml,
        dgiiTrackId: dgiiResponse.trackId,
        dgiiStatus: dgiiResponse.status,
        dgiiResponse: dgiiResponse.rawResponse,
        dgiiSubmittedAt,
      },
    });
    return {};
  });
}

const nextCotizacionNumber = async (
  tx: Prisma.TransactionClient,
  companyId: number,
) => {
  const agg = await tx.cotizacion.aggregate({
    where: { companyId },
    _max: { number: true },
  });
  return (agg._max.number ?? 0) + 1;
};

const normalizeIncomingItems = (
  items: IncomingItem[] | undefined,
): Array<{
  itemNumber: number;
  quantity: number;
  unit: string;
  description: string;
  unitPrice: number;
  totalValue: number;
}> => {
  const raw =
    items && items.length > 0
      ? items
      : [
          {
            quantity: 1,
            unit: "Servicio",
            description: "Servicio / concepto (editar)",
            unit_price: 0,
          },
        ];

  return raw.map((row, idx) => {
    const quantity = Number.isFinite(row.quantity) ? row.quantity : 0;
    const unitPrice = Number.isFinite(row.unit_price) ? row.unit_price : 0;
    const unit = (row.unit ?? "").trim() || "Unidad";
    const description = (row.description ?? "").trim() || "Item";
    const totalValue = itemLineTotalValue(quantity, unitPrice);
    return {
      quantity,
      unit,
      description,
      unitPrice,
      totalValue,
      itemNumber: idx + 1,
    };
  });
};

const validateLinesHavePositiveAmount = (
  lines: Array<{ itemNumber: number; totalValue: number }>,
): string | null => {
  const bad = lines.filter((l) => l.totalValue <= 0);
  if (!bad.length) return null;
  const nums = bad.map((l) => l.itemNumber).join(", ");
  return `Línea(s) ${nums}: el monto debe ser mayor que cero (cantidad × precio). DGII no acepta MontoItem 0.00.`;
};

export const cotizacionService = {
  async createClientWithCotizacion(
    companyId: number,
    input: CreateClientWithCotizacionInput,
  ) {
    const cName = input.client.name?.trim();
    const cRnc = input.client.rnc_cedula?.trim();
    const docDigits = toDocDigits(cRnc ?? "");
    const maybeRnc = docDigits.length >= 9 && docDigits.length <= 11 ? docDigits : null;
    const maybeCedula = docDigits.length === 11 ? docDigits : null;
    if (!cName || !cRnc || cRnc.length < 3) {
      return {
        ok: false as const,
        status: 400,
        message: "Cliente: nombre y RNC o cedula validos son obligatorios.",
      };
    }
    const clientPhone = trimOrNull(input.client.phone ?? undefined);
    if (clientPhone && !isValidPhoneFormat(clientPhone)) {
      return {
        ok: false as const,
        status: 400,
        message: "El telefono del cliente debe tener formato xxx-xxx-xxxx.",
      };
    }
    const paymentTerms = input.cotizacion.payment_terms?.trim() ?? "";
    const paymentMethod = trimOrNull(input.cotizacion.payment_method ?? undefined);
    const accountManager = input.cotizacion.account_manager?.trim() ?? "";
    const comment = trimOrNull(input.cotizacion.comment ?? undefined);
    const documentTitle =
      trimOrNull(input.cotizacion.document_title ?? undefined) ?? "Pre-factura";
    const fiscalLegend =
      trimOrNull(input.cotizacion.fiscal_legend ?? undefined) ?? "Sin valor fiscal";
    const ecfTipo = normalizeEcfTipo(input.cotizacion.ecf_tipo ?? undefined);
    const ecfReferenceNcf = trimOrNull(input.cotizacion.ecf_reference_ncf ?? undefined);
    const bizErr = validateCotizacionEcfBusiness(ecfTipo, ecfReferenceNcf, cRnc ?? "");
    if (bizErr.length) {
      return {
        ok: false as const,
        status: 400,
        message: bizErr.join(" "),
      };
    }
    if (!paymentTerms || !accountManager) {
      return {
        ok: false as const,
        status: 400,
        message: "Condiciones de pago y ejecutivo de cuentas son obligatorios.",
      };
    }

    const lines = normalizeIncomingItems(input.items);
    const lineAmountErr = validateLinesHavePositiveAmount(lines);
    if (lineAmountErr) {
      return { ok: false as const, status: 400, message: lineAmountErr };
    }
    const autoTotals = calculateTotalsFromItems(
      lines.map((l) => ({ totalValue: l.totalValue })),
    );
    const calcMode = input.cotizacion.calc_mode === "manual" ? "manual" : "auto";
    const manualSubtotal = Number(input.cotizacion.subtotal);
    const manualItbis = Number(input.cotizacion.itbis);
    const manualTotal = Number(input.cotizacion.total);
    const hasValidManualTotals =
      Number.isFinite(manualSubtotal) &&
      Number.isFinite(manualItbis) &&
      Number.isFinite(manualTotal) &&
      manualSubtotal >= 0 &&
      manualItbis >= 0 &&
      manualTotal >= 0 &&
      Math.abs(round2(manualSubtotal + manualItbis) - round2(manualTotal)) <= 0.01;
    const totals =
      calcMode === "manual" && hasValidManualTotals
        ? {
            subtotal: round2(manualSubtotal),
            itbis: round2(manualItbis),
            total: round2(manualTotal),
          }
        : autoTotals;

    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const clientByRnc = maybeRnc
        ? await tx.client.findFirst({
            where: { companyId, rnc: maybeRnc },
            orderBy: { id: "desc" },
          })
        : null;
      const clientByCedula =
        !clientByRnc && maybeCedula
          ? await tx.client.findFirst({
              where: { companyId, cedula: maybeCedula },
              orderBy: { id: "desc" },
            })
          : null;

      const client =
        clientByRnc ||
        clientByCedula ||
        (await tx.client.create({
          data: {
            name: cName,
            address: trimOrNull(input.client.address ?? undefined),
            rncCedula: cRnc,
            rnc: maybeRnc,
            cedula: maybeCedula,
            phone: clientPhone,
            email: trimOrNull(input.client.email ?? undefined),
            companyId,
          },
        }));

      const number = await nextCotizacionNumber(tx, companyId);
      const ecfNcfSeq = await allocateEcfNcfSeq(tx, companyId, ecfTipo);

      const cotizacion = await tx.cotizacion.create({
        data: {
          number,
          clientId: client.id,
          companyId,
          documentTitle,
          fiscalLegend,
          paymentTerms,
          paymentMethod,
          accountManager,
          comment,
          ecfTipo,
          ecfNcfSeq,
          ecfReferenceNcf,
          subtotal: totals.subtotal,
          itbis: totals.itbis,
          total: totals.total,
        },
      });

      for (const line of lines) {
        await tx.cotizacionItem.create({
          data: {
            cotizacionId: cotizacion.id,
            itemNumber: line.itemNumber,
            quantity: line.quantity,
            unit: line.unit,
            description: line.description,
            unitPrice: line.unitPrice,
            totalValue: line.totalValue,
          },
        });
      }

      const full = await tx.cotizacion.findFirstOrThrow({
        where: { id: cotizacion.id, companyId },
        include: {
          items: { orderBy: { itemNumber: "asc" } },
          client: true,
          company: true,
        },
      });

      return { client, cotizacion: full };
    });
    } catch (e) {
      if (e instanceof Error && e.name === ECF_NCF_SEQ_EXCEEDED_ERROR_NAME) {
        return {
          ok: false as const,
          status: 400,
          message: e.message,
        };
      }
      throw e;
    }

    return { ok: true as const, ...result };
  },

  listByCompany(companyId: number) {
    return prisma.cotizacion.findMany({
      where: { companyId },
      orderBy: { id: "desc" },
      include: {
        client: true,
        items: { orderBy: { itemNumber: "asc" } },
      },
    });
  },

  getByIdForCompany(id: number, companyId: number) {
    return prisma.cotizacion.findFirst({
      where: { id, companyId },
      include: {
        client: true,
        company: true,
        items: { orderBy: { itemNumber: "asc" } },
      },
    });
  },

  async updateCotizacion(
    id: number,
    companyId: number,
    input: UpdateCotizacionInput,
  ) {
    const existing = await prisma.cotizacion.findFirst({
      where: { id, companyId },
      include: { client: true },
    });
    if (!existing) {
      return {
        ok: false as const,
        status: 404,
        message: "Cotizacion no encontrada.",
      };
    }

    const cName = input.client.name?.trim();
    const cRnc = input.client.rnc_cedula?.trim();
    const docDigits = toDocDigits(cRnc ?? "");
    const maybeRnc = docDigits.length >= 9 && docDigits.length <= 11 ? docDigits : null;
    const maybeCedula = docDigits.length === 11 ? docDigits : null;
    if (!cName || !cRnc || cRnc.length < 3) {
      return {
        ok: false as const,
        status: 400,
        message: "Cliente: nombre y RNC o cedula validos son obligatorios.",
      };
    }
    const clientPhone = trimOrNull(input.client.phone ?? undefined);
    if (clientPhone && !isValidPhoneFormat(clientPhone)) {
      return {
        ok: false as const,
        status: 400,
        message: "El telefono del cliente debe tener formato xxx-xxx-xxxx.",
      };
    }
    const paymentTerms = input.cotizacion.payment_terms?.trim() ?? "";
    const paymentMethod = trimOrNull(input.cotizacion.payment_method ?? undefined);
    const accountManager = input.cotizacion.account_manager?.trim() ?? "";
    const comment = trimOrNull(input.cotizacion.comment ?? undefined);
    const documentTitle =
      trimOrNull(input.cotizacion.document_title ?? undefined) ?? "Pre-factura";
    const fiscalLegend =
      trimOrNull(input.cotizacion.fiscal_legend ?? undefined) ?? "Sin valor fiscal";

    const dgiiLocked =
      Boolean(existing.dgiiTrackId?.trim()) || existing.dgiiSubmittedAt != null;

    let ecfTipo = normalizeEcfTipo(input.cotizacion.ecf_tipo ?? undefined);
    let ecfReferenceNcf = trimOrNull(input.cotizacion.ecf_reference_ncf ?? undefined);

    if (dgiiLocked) {
      ecfTipo = existing.ecfTipo;
      ecfReferenceNcf = existing.ecfReferenceNcf;
    }

    if (!dgiiLocked) {
      const bizErr = validateCotizacionEcfBusiness(ecfTipo, ecfReferenceNcf, cRnc ?? "");
      if (bizErr.length) {
        return {
          ok: false as const,
          status: 400,
          message: bizErr.join(" "),
        };
      }
    }

    if (!paymentTerms || !accountManager) {
      return {
        ok: false as const,
        status: 400,
        message: "Condiciones de pago y ejecutivo de cuentas son obligatorios.",
      };
    }

    const lines = normalizeIncomingItems(input.items);
    const lineAmountErr = validateLinesHavePositiveAmount(lines);
    if (lineAmountErr) {
      return { ok: false as const, status: 400, message: lineAmountErr };
    }
    const autoTotals = calculateTotalsFromItems(
      lines.map((l) => ({ totalValue: l.totalValue })),
    );
    const calcMode = input.cotizacion.calc_mode === "manual" ? "manual" : "auto";
    const manualSubtotal = Number(input.cotizacion.subtotal);
    const manualItbis = Number(input.cotizacion.itbis);
    const manualTotal = Number(input.cotizacion.total);
    const hasValidManualTotals =
      Number.isFinite(manualSubtotal) &&
      Number.isFinite(manualItbis) &&
      Number.isFinite(manualTotal) &&
      manualSubtotal >= 0 &&
      manualItbis >= 0 &&
      manualTotal >= 0 &&
      Math.abs(round2(manualSubtotal + manualItbis) - round2(manualTotal)) <= 0.01;
    const totals =
      calcMode === "manual" && hasValidManualTotals
        ? {
            subtotal: round2(manualSubtotal),
            itbis: round2(manualItbis),
            total: round2(manualTotal),
          }
        : autoTotals;

    let cotizacion;
    try {
      cotizacion = await prisma.$transaction(async (tx) => {
        await tx.client.update({
        where: { id: existing.client.id },
        data: {
          name: cName,
          address: trimOrNull(input.client.address ?? undefined),
          rncCedula: cRnc,
          rnc: maybeRnc,
          cedula: maybeCedula,
          phone: clientPhone,
          email: trimOrNull(input.client.email ?? undefined),
        },
      });

      let ecfNcfSeq = existing.ecfNcfSeq;
      let ecfTipoFinal = ecfTipo;
      let ecfReferenceFinal = ecfReferenceNcf;

      if (dgiiLocked) {
        ecfTipoFinal = existing.ecfTipo;
        ecfNcfSeq = existing.ecfNcfSeq;
        ecfReferenceFinal = existing.ecfReferenceNcf;
      } else       if (ecfTipoFinal !== existing.ecfTipo) {
        ecfNcfSeq = await allocateEcfNcfSeq(tx, companyId, ecfTipoFinal);
      }

      const resetDgiiAfterNonSequenceReject =
        existing.dgiiStatus === "rejected" &&
        Boolean(existing.dgiiResponse?.trim()) &&
        !isDgiiSequenceRejection(existing.dgiiResponse);

      await tx.cotizacion.update({
        where: { id },
        data: {
          paymentTerms,
          paymentMethod,
          accountManager,
          comment,
          documentTitle,
          fiscalLegend,
          ecfTipo: ecfTipoFinal,
          ecfNcfSeq,
          ecfReferenceNcf: ecfReferenceFinal,
          subtotal: totals.subtotal,
          itbis: totals.itbis,
          total: totals.total,
          ...(resetDgiiAfterNonSequenceReject
            ? {
                dgiiStatus: null,
                dgiiResponse: null,
                signedXml: null,
              }
            : {}),
        },
      });

      await tx.cotizacionItem.deleteMany({
        where: { cotizacionId: id },
      });
      for (const line of lines) {
        await tx.cotizacionItem.create({
          data: {
            cotizacionId: id,
            itemNumber: line.itemNumber,
            quantity: line.quantity,
            unit: line.unit,
            description: line.description,
            unitPrice: line.unitPrice,
            totalValue: line.totalValue,
          },
        });
      }

      return tx.cotizacion.findFirstOrThrow({
        where: { id, companyId },
        include: {
          items: { orderBy: { itemNumber: "asc" } },
          client: true,
          company: true,
        },
      });
    });
    } catch (e) {
      if (e instanceof Error && e.name === ECF_NCF_SEQ_EXCEEDED_ERROR_NAME) {
        return {
          ok: false as const,
          status: 400,
          message: e.message,
        };
      }
      throw e;
    }

    return { ok: true as const, cotizacion };
  },

  async deleteCotizacion(id: number, companyId: number) {
    const existing = await prisma.cotizacion.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) {
      return {
        ok: false as const,
        status: 404,
        message: "Cotizacion no encontrada.",
      };
    }
    await prisma.cotizacion.delete({
      where: { id },
    });
    return { ok: true as const };
  },
};
