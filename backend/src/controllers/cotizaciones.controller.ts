import "../types/express-auth.augment";
import type { RequestHandler } from "express";
import {
  cotizacionService,
  type IncomingItem,
} from "../services/cotizacion.service";
import { generateDGIIData } from "../utils/dgii";
import { buildCotizacionPdfBuffer } from "../utils/cotizacion-pdf";

const stripTenantFromBody = (body: Record<string, unknown>) => {
  delete body.company_id;
  delete body.companyId;
};

const serializeCotizacion = (
  c: NonNullable<Awaited<ReturnType<typeof cotizacionService.getByIdForCompany>>>,
) => ({
  id: c.id,
  number: c.number,
  client_id: c.clientId,
  company_id: c.companyId,
  payment_terms: c.paymentTerms,
  account_manager: c.accountManager,
  document_title: c.documentTitle,
  fiscal_legend: c.fiscalLegend,
  subtotal: c.subtotal,
  itbis: c.itbis,
  total: c.total,
  created_at: c.createdAt.toISOString(),
  client: {
    id: c.client.id,
    name: c.client.name,
    rnc_cedula: c.client.rncCedula,
    phone: c.client.phone,
    email: c.client.email,
  },
  company: {
    id: c.company.id,
    name: c.company.name,
    rnc: c.company.rnc,
    address: c.company.address,
    phone: c.company.phone,
    email: c.company.email,
    regime: c.company.regime,
  },
  items: c.items.map((i) => ({
    id: i.id,
    item_number: i.itemNumber,
    quantity: i.quantity,
    unit: i.unit,
    description: i.description,
    unit_price: i.unitPrice,
    total_value: i.totalValue,
  })),
});

export const createClientWithCotizacion: RequestHandler = async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) {
    res.status(401).json({ message: "No autorizado." });
    return;
  }
  if (req.body && typeof req.body === "object") {
    stripTenantFromBody(req.body as Record<string, unknown>);
  }

  const body = req.body as Record<string, unknown>;
  const client = body.client as Record<string, unknown> | undefined;
  const cot = body.cotizacion as Record<string, unknown> | undefined;
  const itemsRaw = body.items;

  if (!client || !cot) {
    res.status(400).json({ message: "Faltan secciones client y cotizacion." });
    return;
  }

  const items: IncomingItem[] | undefined = Array.isArray(itemsRaw)
    ? (itemsRaw as unknown[]).map((row) => {
        const r = row as Record<string, unknown>;
        return {
          quantity: Number(r.quantity ?? 0),
          unit: String(r.unit ?? ""),
          description: String(r.description ?? ""),
          unit_price: Number(r.unit_price ?? r.unitPrice ?? 0),
        };
      })
    : undefined;

  const out = await cotizacionService.createClientWithCotizacion(companyId, {
    client: {
      name: typeof client.name === "string" ? client.name : "",
      rnc_cedula: String(client.rnc_cedula ?? client.rncCedula ?? ""),
      phone: typeof client.phone === "string" ? client.phone : undefined,
      email: typeof client.email === "string" ? client.email : undefined,
    },
    cotizacion: {
      payment_terms:
        typeof cot.payment_terms === "string" ? cot.payment_terms : "",
      account_manager:
        typeof cot.account_manager === "string" ? cot.account_manager : "",
      document_title:
        typeof cot.document_title === "string" ? cot.document_title : undefined,
      fiscal_legend:
        typeof cot.fiscal_legend === "string" ? cot.fiscal_legend : undefined,
    },
    items,
  });

  if (!out.ok) {
    res.status(out.status).json({ message: out.message });
    return;
  }

  const serialized = serializeCotizacion(out.cotizacion);
  res.status(201).json({
    message: "Cliente y cotizacion creados.",
    client: {
      id: out.client.id,
      name: out.client.name,
      rnc_cedula: out.client.rncCedula,
      phone: out.client.phone,
      email: out.client.email,
      company_id: out.client.companyId,
    },
    cotizacion: serialized,
    dgii_preview: generateDGIIData(out.cotizacion),
  });
};

export const listCotizaciones: RequestHandler = async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) {
    res.status(401).json({ message: "No autorizado." });
    return;
  }
  const rows = await cotizacionService.listByCompany(companyId);
  res.json({
    cotizaciones: rows.map((c) => ({
      id: c.id,
      number: c.number,
      client_id: c.clientId,
      company_id: c.companyId,
      payment_terms: c.paymentTerms,
      account_manager: c.accountManager,
      subtotal: c.subtotal,
      itbis: c.itbis,
      total: c.total,
      created_at: c.createdAt.toISOString(),
      client_name: c.client.name,
      items_count: c.items.length,
    })),
  });
};

export const getCotizacionById: RequestHandler = async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) {
    res.status(401).json({ message: "No autorizado." });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ message: "ID invalido." });
    return;
  }
  const row = await cotizacionService.getByIdForCompany(id, companyId);
  if (!row) {
    res.status(404).json({ message: "Cotizacion no encontrada." });
    return;
  }
  res.json({
    cotizacion: serializeCotizacion(row),
    dgii_preview: generateDGIIData(row),
  });
};

export const downloadCotizacionPdf: RequestHandler = async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) {
    res.status(401).json({ message: "No autorizado." });
    return;
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ message: "ID invalido." });
    return;
  }

  const row = await cotizacionService.getByIdForCompany(id, companyId);
  if (!row) {
    res.status(404).json({ message: "Cotizacion no encontrada." });
    return;
  }

  const pdfBuffer = await buildCotizacionPdfBuffer(row);
  const fileName = `cotizacion-${row.number}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.status(200).send(pdfBuffer);
};
