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
import {
  buildConsumoMenor250SignedPack,
  cotizacionRequiereFlujoRfce32,
  getStoredConsumoMenor250IntegraForDownload,
  submitConsumoMenor250RfceForCotizacion,
} from "../services/ecfConsumoRfce.service";
import { ensureRepresentacionImpresaPdfForCotizacion } from "../services/ecfRepresentacionImpresa.service";
import { companyHasCertificateRecord } from "../utils/companyCertificateStorage";
import { parseDgiiCertProfile } from "../types/dgiiCertProfile";
import {
  formatDgiiResponseFullMessage,
  isDgiiSequenceRejection,
  summarizeDgiiResponse,
} from "../utils/dgiiRejection";
import { buildEcfNumber } from "../utils/ecfTipo";
import { retryQueuedCotizacionSubmit } from "../services/dgiiSubmitQueue.service";

const stripTenantFromBody = (body: Record<string, unknown>) => {
  delete body.company_id;
  delete body.companyId;
};

const pickStr = (b: Record<string, unknown>, k: string): string | undefined =>
  typeof b[k] === "string" ? (b[k] as string) : undefined;

/** Tras crear/editar cotización: firma y guarda XML si la empresa tiene certificado. */
const trySignDraftEcfAfterWrite = async (
  cotizacionId: number,
  companyId: number,
  certificateEncryptionSecret: string | undefined,
): Promise<
  { status: "ok" } | { status: "skipped" } | { status: "error"; message: string }
> => {
  const companyRow = await prisma.company.findUnique({ where: { id: companyId } });
  if (!companyRow || !companyHasCertificateRecord(companyRow)) {
    return { status: "skipped" };
  }
  const pathMod = await import("node:path");
  const uploadsRoot = pathMod.join(process.cwd(), "uploads");
  const out = await ecfService.signAndStoreDraftForCotizacion(cotizacionId, companyId, {
    uploadsRoot,
    certificateEncryptionSecret: certificateEncryptionSecret?.trim() || undefined,
  });
  if (!out.ok) return { status: "error", message: out.message };
  return { status: "ok" };
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
  ecf_tipo: c.ecfTipo,
  ecf_ncf_seq: c.ecfNcfSeq,
  ecf_reference_ncf: c.ecfReferenceNcf,
  subtotal: c.subtotal,
  itbis: c.itbis,
  total: c.total,
  dgii_track_id: c.dgiiTrackId,
  dgii_status: c.dgiiStatus,
  dgii_response: c.dgiiResponse,
  signed_xml: c.signedXml,
  dgii_submitted_at: c.dgiiSubmittedAt?.toISOString() ?? null,
  dgii_submit_retry_count: c.dgiiSubmitRetryCount ?? 0,
  dgii_submit_next_retry_at: c.dgiiSubmitNextRetryAt?.toISOString() ?? null,
  dgii_submit_last_error: c.dgiiSubmitLastError ?? null,
  dgii_rejection_summary:
    c.dgiiStatus === "rejected" && c.dgiiResponse?.trim()
      ? summarizeDgiiResponse(c.dgiiResponse)
      : null,
  dgii_rejection_full:
    c.dgiiStatus === "rejected" && c.dgiiResponse?.trim()
      ? formatDgiiResponseFullMessage(c.dgiiResponse)
      : null,
  dgii_resubmit_new_seq:
    c.dgiiStatus === "rejected" && c.dgiiResponse?.trim()
      ? isDgiiSequenceRejection(c.dgiiResponse)
      : false,
  ecf_ri_pdf_path: c.ecfRiPdfPath,
  ecf_ri_qr_url: c.ecfRiQrUrl,
  ecf_ri_generated_at: c.ecfRiGeneratedAt?.toISOString() ?? null,
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

  const encFromBody = pickStr(body, "certificate_encryption_secret") ?? "";
  const companyRow = await prisma.company.findUnique({ where: { id: companyId } });
  if (companyRow && companyHasCertificateRecord(companyRow)) {
    const encOk =
      encFromBody.trim().length >= 8 ||
      (companyRow.certificateKeyphrase?.trim()?.length ?? 0) >= 8;
    if (!encOk) {
      res.status(400).json({
        message:
          "La empresa tiene certificado DGII. Indicá certificate_encryption_secret en el cuerpo JSON (clave de cifrado del .p12, mín. 8 caracteres) o guardala en Perfil de empresa para generar el e-CF firmado al crear la cotización.",
      });
      return;
    }
  }

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
      ecf_tipo:
        typeof cot.ecf_tipo === "string"
          ? cot.ecf_tipo
          : typeof cot.ecfTipo === "string"
            ? cot.ecfTipo
            : undefined,
      ecf_reference_ncf:
        typeof cot.ecf_reference_ncf === "string"
          ? cot.ecf_reference_ncf
          : typeof cot.ecfReferenceNcf === "string"
            ? cot.ecfReferenceNcf
            : undefined,
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

  const signResult = await trySignDraftEcfAfterWrite(out.cotizacion.id, companyId, encFromBody);
  const refreshed = await cotizacionService.getByIdForCompany(out.cotizacion.id, companyId);
  if (!refreshed) {
    res.status(500).json({ message: "No se pudo recargar la cotizacion." });
    return;
  }

  const serialized = serializeCotizacion(refreshed);
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
    dgii_preview: generateDGIIData(refreshed),
    ...(signResult.status === "error"
      ? { ecf_draft_sign_warning: signResult.message }
      : {}),
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
      ecf_tipo: c.ecfTipo,
      ecf_ncf_seq: c.ecfNcfSeq,
      ecf_reference_ncf: c.ecfReferenceNcf,
      subtotal: c.subtotal,
      itbis: c.itbis,
      total: c.total,
      created_at: c.createdAt.toISOString(),
      client_name: c.client.name,
      client_rnc_cedula: c.client.rncCedula,
      dgii_status: c.dgiiStatus,
      dgii_track_id: c.dgiiTrackId,
      dgii_submitted_at: c.dgiiSubmittedAt?.toISOString() ?? null,
      dgii_submit_retry_count: c.dgiiSubmitRetryCount ?? 0,
      dgii_submit_next_retry_at: c.dgiiSubmitNextRetryAt?.toISOString() ?? null,
      dgii_submit_last_error: c.dgiiSubmitLastError ?? null,
      dgii_rejection_summary:
        c.dgiiStatus === "rejected" && c.dgiiResponse?.trim()
          ? summarizeDgiiResponse(c.dgiiResponse)
          : null,
      dgii_rejection_full:
        c.dgiiStatus === "rejected" && c.dgiiResponse?.trim()
          ? formatDgiiResponseFullMessage(c.dgiiResponse)
          : null,
      dgii_resubmit_new_seq:
        c.dgiiStatus === "rejected" && c.dgiiResponse?.trim()
          ? isDgiiSequenceRejection(c.dgiiResponse)
          : false,
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
      ecf_tipo:
        typeof cot.ecf_tipo === "string"
          ? cot.ecf_tipo
          : typeof cot.ecfTipo === "string"
            ? cot.ecfTipo
            : undefined,
      ecf_reference_ncf:
        typeof cot.ecf_reference_ncf === "string"
          ? cot.ecf_reference_ncf
          : typeof cot.ecfReferenceNcf === "string"
            ? cot.ecfReferenceNcf
            : undefined,
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

  const encFromBody = pickStr(body, "certificate_encryption_secret") ?? "";
  const afterUpdate = await cotizacionService.getByIdForCompany(id, companyId);
  const locked =
    Boolean(afterUpdate?.dgiiTrackId?.trim()) || Boolean(afterUpdate?.dgiiSubmittedAt != null);

  let ecfDraftSignWarning: string | undefined;
  if (!locked) {
    const companyRow = await prisma.company.findUnique({ where: { id: companyId } });
    if (companyRow && companyHasCertificateRecord(companyRow)) {
      const encOk =
        encFromBody.trim().length >= 8 ||
        (companyRow.certificateKeyphrase?.trim()?.length ?? 0) >= 8;
      if (!encOk) {
        res.status(400).json({
          message:
            "La empresa tiene certificado DGII. Indicá certificate_encryption_secret en el JSON o guardala en Perfil de empresa para actualizar el e-CF firmado.",
        });
        return;
      }
    }
    const signResult = await trySignDraftEcfAfterWrite(id, companyId, encFromBody);
    if (signResult.status === "error") {
      ecfDraftSignWarning = signResult.message;
    }
  }

  const finalRow = await cotizacionService.getByIdForCompany(id, companyId);
  if (!finalRow) {
    res.status(404).json({ message: "Cotizacion no encontrada." });
    return;
  }

  res.json({
    message: "Cotizacion actualizada.",
    cotizacion: serializeCotizacion(finalRow),
    dgii_preview: generateDGIIData(finalRow),
    ...(ecfDraftSignWarning ? { ecf_draft_sign_warning: ecfDraftSignWarning } : {}),
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

export const downloadRepresentacionImpresaEcf: RequestHandler = async (req, res) => {
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

  const pathMod = await import("node:path");
  const uploadsRoot = pathMod.join(process.cwd(), "uploads");
  const out = await ensureRepresentacionImpresaPdfForCotizacion(id, companyId, uploadsRoot);
  if (!out.ok) {
    res.status(out.status).json({ message: out.message });
    return;
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${out.filename}"`);
  res.status(200).send(out.buffer);
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

  const row = await prisma.cotizacion.findFirst({
    where: { id, companyId },
    select: { signedXml: true },
  });
  const stored = row?.signedXml?.trim();
  if (stored) {
    const encf =
      stored.match(/<eNCF>\s*([^<\s]+)\s*<\/eNCF>/i)?.[1]?.trim() ?? "";
    res.json({
      message: "XML e-CF firmado (listo para DGII).",
      ecf_number: encf,
      xml: stored,
      signed: true,
    });
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
    signed: false,
  });
};

export const signEcfXmlByCotizacion: RequestHandler = async (req, res) => {
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

  const out = await ecfService.signEcfXmlForCotizacion(id, companyId, {
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
    message: "e-CF firmado localmente (no enviado a DGII).",
    ecf_number: out.ecf_number,
    signed_xml: out.signedXml,
  });
};

/** RFCE + e-CF íntegro firmados para consumo 32 &lt; RD$250k (subida manual CerteCF). */
export const buildConsumoMenor250PackByCotizacion: RequestHandler = async (req, res) => {
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

  const forceRegenerate =
    typeof req.query.force === "string" &&
    ["1", "true", "yes"].includes(req.query.force.trim().toLowerCase());

  const out = await buildConsumoMenor250SignedPack(id, companyId, {
    uploadsRoot,
    certificateEncryptionSecret,
    oneShotCertificate,
    forceRegenerate,
    persist: !forceRegenerate,
  });

  if (!out.ok) {
    res.status(out.status).json({
      message: out.message,
      errors: "errors" in out ? out.errors : undefined,
      ...(out.code ? { code: out.code } : {}),
    });
    return;
  }

  const part = (typeof req.query.part === "string" ? req.query.part.trim().toLowerCase() : "") || "";
  const encf = out.pack.ecf_number.replace(/[^\w.-]/g, "") || "consumo";

  if (part === "rfce") {
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="RFCE-${encf}.xml"`);
    res.status(200).send(out.pack.rfce_signed_xml);
    return;
  }
  if (part === "integra") {
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="ECF-${encf}.xml"`);
    res.status(200).send(out.pack.integra_signed_xml);
    return;
  }

  res.json({
    message:
      "RFCE y e-CF íntegro generados y firmados. Subí primero el RFCE a CerteCF; cuando esté aceptado, el e-CF íntegro.",
    flow: "consumo_menor_250_rfce",
    document_type_rfce: true,
    ...out.pack,
  });
};

/** GET — e-CF íntegro firmado guardado (sin re-firmar; portal CerteCF &lt;250Mil). */
export const downloadConsumoMenor250IntegraByCotizacion: RequestHandler = async (req, res) => {
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

  const stored = await getStoredConsumoMenor250IntegraForDownload(id, companyId);
  if (!stored) {
    res.status(404).json({
      code: "INTEGRA_NOT_STORED",
      message:
        "No hay e-CF íntegro guardado. Usá «Enviar RFCE» primero; después descargá el mismo XML firmado para subirlo al portal.",
    });
    return;
  }

  const encf = stored.ecf_number.replace(/[^\w.-]/g, "") || "consumo";
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="ECF-${encf}.xml"`);
  res.status(200).send(stored.integra_signed_xml);
};

/** POST — Genera RFCE + e-CF íntegro y envía el **RFCE** a recepción DGII (tipo 32 &lt; RD$250k). */
export const submitRfceByCotizacion: RequestHandler = async (req, res) => {
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

  const cotRow = await prisma.cotizacion.findFirst({
    where: { id, companyId },
    select: { ecfTipo: true, total: true },
  });
  if (!cotRow) {
    res.status(404).json({ message: "Cotizacion no encontrada." });
    return;
  }
  if (!cotizacionRequiereFlujoRfce32(cotRow.ecfTipo, cotRow.total)) {
    res.status(400).json({
      code: "NOT_RFCE_FLOW",
      message:
        "El envío RFCE solo aplica a Factura de Consumo (32) con total menor a RD$250.000. Para otros tipos usá «Enviar e-CF».",
    });
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

  const out = await submitConsumoMenor250RfceForCotizacion(id, companyId, {
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
    message:
      out.dgii_status === "accepted"
        ? `RFCE ${out.ecf_number} aceptado por DGII. Descargá el e-CF íntegro y subilo a «Facturas de consumo <250Mil».`
        : `RFCE ${out.ecf_number} enviado (estado: ${out.dgii_status}).`,
    flow: "consumo_menor_250_rfce",
    document_type: "RFCE",
    ecf_number: out.ecf_number,
    codigo_seguridade_cf: out.codigo_seguridade_cf,
    dgii_status: out.dgii_status,
    dgii_response: out.dgii_response,
  });
};

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
      certProfile: pickStr((req.body as Record<string, unknown>) ?? {}, "dgii_cert_profile"),
    });
    if (!out.ok) {
      res.status(out.status).json({
        message: out.message,
        errors: "errors" in out ? out.errors : undefined,
        ...(out.code ? { code: out.code } : {}),
      });
      return;
    }

    const cotAfter = await prisma.cotizacion.findFirst({
      where: { id, companyId },
      select: { ecfTipo: true, ecfNcfSeq: true },
    });
    const ecfNcfSeq = out.newEcfNcfSeq ?? cotAfter?.ecfNcfSeq;
    const ecfTipoForNumber = cotAfter?.ecfTipo ?? "31";
    const ecfNumber =
      ecfNcfSeq != null && ecfNcfSeq > 0
        ? buildEcfNumber(ecfTipoForNumber, ecfNcfSeq)
        : undefined;

    const dgiiStatusSummary = summarizeDgiiResponse(out.dgiiResponse.rawResponse);

    if (out.submitQueued) {
      res.status(202).json({
        message:
          "DGII no está disponible en este momento. El comprobante quedó firmado y en cola; se reenviará automáticamente sin perder la operación.",
        status: out.dgiiResponse.status,
        queued: true,
        track_id: out.dgiiResponse.trackId,
        accepted: false,
        dgii_response: out.dgiiResponse.rawResponse,
        dgii_submit_retry_count: out.dgiiSubmitRetryCount,
        dgii_submit_next_retry_at: out.dgiiSubmitNextRetryAt,
      });
      return;
    }

    res.json({
      message: "e-CF enviado a DGII.",
      status: out.dgiiResponse.status,
      track_id: out.dgiiResponse.trackId,
      accepted: out.dgiiResponse.accepted,
      dgii_response: out.dgiiResponse.rawResponse,
      dgii_status_summary: dgiiStatusSummary,
      certificate_saved: Boolean(oneShotCertificate?.buffer?.length),
      ...(ecfNcfSeq != null && ecfNcfSeq > 0 ? { ecf_ncf_seq: ecfNcfSeq, ecf_number: ecfNumber } : {}),
      ...(out.dgiiResponse.status === "rejected"
        ? {
            dgii_rejection_summary: dgiiStatusSummary,
            dgii_resubmit_new_seq: isDgiiSequenceRejection(out.dgiiResponse.rawResponse),
          }
        : {}),
    });
  } catch (e) {
    res.status(500).json({
      message: e instanceof Error ? e.message : "Error al enviar e-CF.",
    });
  }
};

export const retryQueuedDgiiSubmitByCotizacion: RequestHandler = async (req, res) => {
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

  const out = await retryQueuedCotizacionSubmit(id, companyId, {
    uploadsRoot,
    certificateEncryptionSecret: certificateEncryptionSecret || undefined,
    certProfile: parseDgiiCertProfile(
      pickStr((req.body as Record<string, unknown>) ?? {}, "dgii_cert_profile"),
    ),
    force: true,
  });

  if (!out.ok) {
    res.status(out.status).json({
      message: out.message,
      ...(out.code ? { code: out.code } : {}),
      ...(out.requeued ? { requeued: true } : {}),
      ...(out.submitFailed ? { submit_failed: true } : {}),
    });
    return;
  }

  const dgiiStatusSummary = summarizeDgiiResponse(out.dgiiResponse.rawResponse);
  res.json({
    message: "e-CF reenviado a DGII desde la cola.",
    status: out.dgiiResponse.status,
    track_id: out.dgiiResponse.trackId,
    accepted: out.dgiiResponse.accepted,
    dgii_response: out.dgiiResponse.rawResponse,
    dgii_status_summary: dgiiStatusSummary,
    ...(out.newEcfNcfSeq != null ? { ecf_ncf_seq: out.newEcfNcfSeq } : {}),
  });
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

  const qp = req.query?.dgii_cert_profile;
  const consultOpts =
    qp !== undefined && String(qp).trim() !== ""
      ? { certProfile: parseDgiiCertProfile(qp) }
      : undefined;

  const out = await ecfService.consultDgiiForCotizacion(id, companyId, consultOpts);
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
    dgii_status: out.dgii_status,
  });
};
