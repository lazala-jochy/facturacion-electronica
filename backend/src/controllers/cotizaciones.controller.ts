import "../types/express-auth.augment";
import type { RequestHandler } from "express";
import {
  cotizacionService,
  type IncomingItem,
} from "../services/cotizacion.service";
import { generateDGIIData } from "../utils/dgii";
import { buildCotizacionPdfBuffer } from "../utils/cotizacion-pdf";
import { prisma } from "../prisma";
import { ecfService } from "../services/ecf.service";

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
  payment_method: c.paymentMethod,
  account_manager: c.accountManager,
  comment: c.comment,
  document_title: c.documentTitle,
  fiscal_legend: c.fiscalLegend,
  subtotal: c.subtotal,
  itbis: c.itbis,
  total: c.total,
  dgii_track_id: c.dgiiTrackId,
  dgii_status: c.dgiiStatus,
  dgii_response: c.dgiiResponse,
  signed_xml: c.signedXml,
  dgii_submitted_at: c.dgiiSubmittedAt?.toISOString() ?? null,
  created_at: c.createdAt.toISOString(),
  client: {
    id: c.client.id,
    name: c.client.name,
    address: c.client.address,
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
      address: typeof client.address === "string" ? client.address : undefined,
      rnc_cedula: String(client.rnc_cedula ?? client.rncCedula ?? ""),
      phone: typeof client.phone === "string" ? client.phone : undefined,
      email: typeof client.email === "string" ? client.email : undefined,
    },
    cotizacion: {
      payment_terms:
        typeof cot.payment_terms === "string" ? cot.payment_terms : "",
      payment_method:
        typeof cot.payment_method === "string" ? cot.payment_method : undefined,
      account_manager:
        typeof cot.account_manager === "string" ? cot.account_manager : "",
      comment: typeof cot.comment === "string" ? cot.comment : undefined,
      document_title:
        typeof cot.document_title === "string" ? cot.document_title : undefined,
      fiscal_legend:
        typeof cot.fiscal_legend === "string" ? cot.fiscal_legend : undefined,
      calc_mode:
        cot.calc_mode === "manual" || cot.calc_mode === "auto"
          ? cot.calc_mode
          : undefined,
      subtotal: Number(cot.subtotal),
      itbis: Number(cot.itbis),
      total: Number(cot.total),
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
      address: out.client.address,
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
      payment_method: c.paymentMethod,
      account_manager: c.accountManager,
      comment: c.comment,
      subtotal: c.subtotal,
      itbis: c.itbis,
      total: c.total,
      created_at: c.createdAt.toISOString(),
      client_name: c.client.name,
      client_rnc_cedula: c.client.rncCedula,
      dgii_status: c.dgiiStatus,
      dgii_track_id: c.dgiiTrackId,
      dgii_submitted_at: c.dgiiSubmittedAt?.toISOString() ?? null,
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

export const updateCotizacionById: RequestHandler = async (req, res) => {
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

  const out = await cotizacionService.updateCotizacion(id, companyId, {
    client: {
      name: typeof client.name === "string" ? client.name : "",
      address: typeof client.address === "string" ? client.address : undefined,
      rnc_cedula: String(client.rnc_cedula ?? client.rncCedula ?? ""),
      phone: typeof client.phone === "string" ? client.phone : undefined,
      email: typeof client.email === "string" ? client.email : undefined,
    },
    cotizacion: {
      payment_terms: typeof cot.payment_terms === "string" ? cot.payment_terms : "",
      payment_method:
        typeof cot.payment_method === "string" ? cot.payment_method : undefined,
      account_manager:
        typeof cot.account_manager === "string" ? cot.account_manager : "",
      comment: typeof cot.comment === "string" ? cot.comment : undefined,
      document_title:
        typeof cot.document_title === "string" ? cot.document_title : undefined,
      fiscal_legend:
        typeof cot.fiscal_legend === "string" ? cot.fiscal_legend : undefined,
      calc_mode:
        cot.calc_mode === "manual" || cot.calc_mode === "auto"
          ? cot.calc_mode
          : undefined,
      subtotal: Number(cot.subtotal),
      itbis: Number(cot.itbis),
      total: Number(cot.total),
    },
    items,
  });

  if (!out.ok) {
    res.status(out.status).json({ message: out.message });
    return;
  }
  res.json({
    message: "Cotizacion actualizada.",
    cotizacion: serializeCotizacion(out.cotizacion),
    dgii_preview: generateDGIIData(out.cotizacion),
  });
};

export const deleteCotizacionById: RequestHandler = async (req, res) => {
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
  const out = await cotizacionService.deleteCotizacion(id, companyId);
  if (!out.ok) {
    res.status(out.status).json({ message: out.message });
    return;
  }
  res.json({ message: "Cotizacion eliminada." });
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

  const issuerUser = await prisma.user.findFirst({
    where: { id: req.auth?.userId, companyId },
    select: { fullName: true },
  });
  const pdfBuffer = await buildCotizacionPdfBuffer(row, issuerUser?.fullName);
  const fileName = `cotizacion-${row.number}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.status(200).send(pdfBuffer);
};

export const generateEcfXmlByCotizacion: RequestHandler = async (req, res) => {
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

  const out = await ecfService.generateForCotizacion(id, companyId);
  if (!out.ok) {
    res.status(out.status).json({
      message: out.message,
      errors: "errors" in out ? out.errors : undefined,
    });
    return;
  }

  res.json({
    message: "XML e-CF generado.",
    ecf_number: out.payload.ecfNumber,
    xml: out.xml,
  });
};

const pickStr = (b: Record<string, unknown>, k: string): string | undefined =>
  typeof b[k] === "string" ? (b[k] as string) : undefined;

export const submitEcfByCotizacion: RequestHandler = async (req, res) => {
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

  const pathJoin = await import("node:path");
  const uploadsRoot = pathJoin.join(process.cwd(), "uploads");

  const certificateEncryptionSecret =
    pickStr((req.body as Record<string, unknown>) ?? {}, "certificate_encryption_secret") ?? "";

  let oneShotCertificate: { buffer: Buffer; password: string } | undefined;
  const certMulter = req.file;
  if (certMulter?.buffer?.length) {
    try {
      const { validateCertificateMulterFile } = await import("../utils/companyCertificateUpload");
      validateCertificateMulterFile(certMulter);
    } catch (e) {
      res.status(400).json({ message: e instanceof Error ? e.message : "Certificado invalido." });
      return;
    }
    const certPwd =
      pickStr((req.body as Record<string, unknown>) ?? {}, "certificate_password") ?? "";
    oneShotCertificate = { buffer: certMulter.buffer, password: certPwd };
  }

  try {
    const out = await ecfService.submitForCotizacion(id, companyId, {
      uploadsRoot,
      certificateEncryptionSecret,
      oneShotCertificate,
    });
    if (!out.ok) {
      res.status(out.status).json({
        message: out.message,
        errors: "errors" in out ? out.errors : undefined,
        ...(out.code ? { code: out.code } : {}),
      });
      return;
    }

    res.json({
      message: "e-CF enviado a DGII.",
      status: out.dgiiResponse.status,
      track_id: out.dgiiResponse.trackId,
      accepted: out.dgiiResponse.accepted,
      dgii_response: out.dgiiResponse.rawResponse,
      certificate_saved: Boolean(oneShotCertificate?.buffer?.length),
    });
  } catch (e) {
    res.status(500).json({
      message: e instanceof Error ? e.message : "Error al enviar e-CF.",
    });
  }
};

export const queryDgiiEcfByCotizacion: RequestHandler = async (req, res) => {
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

  const out = await ecfService.consultDgiiForCotizacion(id, companyId);
  if (!out.ok) {
    res.status(out.status).json({
      message: out.message,
      ...(out.code ? { code: out.code } : {}),
    });
    return;
  }

  res.json({
    message: "Consulta DGII actualizada.",
    http_status: out.http_status,
    dgii_response: out.dgii_response,
  });
};
