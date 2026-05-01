import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import {
  calculateTotalsFromItems,
  itemLineTotalValue,
} from "../utils/tax";
import { isValidPhoneFormat } from "../utils/validation";

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
    if (!paymentTerms || !accountManager) {
      return {
        ok: false as const,
        status: 400,
        message: "Condiciones de pago y ejecutivo de cuentas son obligatorios.",
      };
    }

    const lines = normalizeIncomingItems(input.items);
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

    const result = await prisma.$transaction(async (tx) => {
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
    if (!paymentTerms || !accountManager) {
      return {
        ok: false as const,
        status: 400,
        message: "Condiciones de pago y ejecutivo de cuentas son obligatorios.",
      };
    }

    const lines = normalizeIncomingItems(input.items);
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

    const cotizacion = await prisma.$transaction(async (tx) => {
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

      await tx.cotizacion.update({
        where: { id },
        data: {
          paymentTerms,
          paymentMethod,
          accountManager,
          comment,
          documentTitle,
          fiscalLegend,
          subtotal: totals.subtotal,
          itbis: totals.itbis,
          total: totals.total,
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
