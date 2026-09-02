import "../types/express-auth.augment";
import path from "node:path";
import type { RequestHandler } from "express";
import type { Compra606 } from "@prisma/client";
import {
  borrador606DesdeArchivo,
  borrador606DesdeCliente,
  borrador606DesdeCotizacion,
  createCompra606,
  crearCompra606DesdeArchivo,
  deleteCompra606,
  generateFormatoTxt,
  listCompras606,
  llenar607DesdeEcf,
  prepareFormatoEnvio,
  previewFormato,
} from "../services/dgiiFormato606607.service";

const uploadsRoot = () => path.join(process.cwd(), "uploads");

const serializeCompra606 = (c: Compra606) => ({
  id: c.id,
  rnc_cedula: c.rncCedula,
  tipo_bienes_servicios: c.tipoBienesServicios,
  ncf: c.ncf,
  ncf_modificado: c.ncfModificado,
  fecha_comprobante: c.fechaComprobante,
  fecha_pago: c.fechaPago,
  monto_servicios: c.montoServicios,
  monto_bienes: c.montoBienes,
  monto_facturado: c.montoFacturado,
  itbis_facturado: c.itbisFacturado,
  itbis_retenido: c.itbisRetenido,
  itbis_sujeto_proporcionalidad: c.itbisSujetoProporcionalidad,
  itbis_llevado_al_costo: c.itbisLlevadoAlCosto,
  itbis_por_adelantar: c.itbisPorAdelantar,
  itbis_percibido_compras: c.itbisPercibidoCompras,
  retencion_renta: c.retencionRenta,
  tipo_retencion_isr: c.tipoRetencionIsr,
  isr_percibido_compras: c.isrPercibidoCompras,
  impuesto_isc: c.impuestoIsc,
  impuestos_otros: c.impuestosOtros,
  monto_propina_legal: c.montoPropinaLegal,
  forma_pago: c.formaPago,
  created_at: c.createdAt.toISOString(),
});

const parseTipo = (raw: string): "606" | "607" | null => {
  const t = raw.trim();
  if (t === "606" || t === "607") return t;
  return null;
};

export const previewFormatoHandler: RequestHandler = async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) {
    res.status(401).json({ message: "No autorizado." });
    return;
  }
  const tipo = parseTipo(String(req.params.tipo ?? ""));
  const periodo = String(req.query.periodo ?? "").trim();
  if (!tipo) {
    res.status(400).json({ message: "Tipo inválido (606 o 607)." });
    return;
  }
  const out = await previewFormato(companyId, tipo, periodo);
  if (!out.ok) {
    res.status(out.status).json({ message: out.message });
    return;
  }
  res.json(out);
};

export const downloadFormatoTxtHandler: RequestHandler = async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) {
    res.status(401).json({ message: "No autorizado." });
    return;
  }
  const tipo = parseTipo(String(req.params.tipo ?? ""));
  const periodo = String(req.query.periodo ?? "").trim();
  if (!tipo) {
    res.status(400).json({ message: "Tipo inválido (606 o 607)." });
    return;
  }
  const out = await generateFormatoTxt(companyId, tipo, periodo);
  if (!out.ok) {
    res.status(out.status).json({ message: out.message });
    return;
  }
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${out.filename}"`);
  res.status(200).send(out.content);
};

export const enviarFormatoHandler: RequestHandler = async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) {
    res.status(401).json({ message: "No autorizado." });
    return;
  }
  const tipo = parseTipo(String(req.params.tipo ?? ""));
  const periodo = String(req.body?.periodo ?? req.query.periodo ?? "").trim();
  if (!tipo) {
    res.status(400).json({ message: "Tipo inválido (606 o 607)." });
    return;
  }
  const out = await prepareFormatoEnvio(companyId, tipo, periodo, uploadsRoot());
  if (!out.ok) {
    res.status(out.status).json({ message: out.message });
    return;
  }
  res.json(out);
};

export const listCompras606Handler: RequestHandler = async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) {
    res.status(401).json({ message: "No autorizado." });
    return;
  }
  const periodo = String(req.query.periodo ?? "").trim();
  const out = await listCompras606(companyId, periodo);
  if (!out.ok) {
    res.status(out.status).json({ message: out.message });
    return;
  }
  res.json({
    periodo: out.periodo,
    compras: out.compras.map((c) => serializeCompra606(c)),
  });
};

export const createCompra606Handler: RequestHandler = async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) {
    res.status(401).json({ message: "No autorizado." });
    return;
  }
  const periodo = String(req.body?.periodo ?? "").trim();
  const out = await createCompra606(companyId, periodo, req.body ?? {});
  if (!out.ok) {
    res.status(out.status).json({ message: out.message });
    return;
  }
  res.status(201).json({ message: "Compra registrada.", compra: serializeCompra606(out.compra) });
};

export const llenar607DesdeEcfHandler: RequestHandler = async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) {
    res.status(401).json({ message: "No autorizado." });
    return;
  }
  const periodo = String(req.body?.periodo ?? req.query.periodo ?? "").trim();
  const out = await llenar607DesdeEcf(companyId, periodo);
  if (!out.ok) {
    res.status(out.status).json({ message: out.message });
    return;
  }
  res.json(out);
};

export const borrador606Handler: RequestHandler = async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) {
    res.status(401).json({ message: "No autorizado." });
    return;
  }
  const clientId = Number(req.query.client_id);
  const cotizacionId = Number(req.query.cotizacion_id);
  if (Number.isFinite(cotizacionId) && cotizacionId > 0) {
    const out = await borrador606DesdeCotizacion(companyId, cotizacionId);
    if (!out.ok) {
      res.status(out.status).json({ message: out.message });
      return;
    }
    res.json(out);
    return;
  }
  if (Number.isFinite(clientId) && clientId > 0) {
    const out = await borrador606DesdeCliente(companyId, clientId);
    if (!out.ok) {
      res.status(out.status).json({ message: out.message });
      return;
    }
    res.json(out);
    return;
  }
  res.status(400).json({ message: "Indique client_id o cotizacion_id." });
};

export const borrador606DesdeArchivoHandler: RequestHandler = async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) {
    res.status(401).json({ message: "No autorizado." });
    return;
  }
  const file = req.file;
  if (!file?.buffer?.length) {
    res.status(400).json({ message: "Suba una imagen o PDF de la factura de compra." });
    return;
  }
  const out = await borrador606DesdeArchivo(file.buffer, file.mimetype);
  if (!out.ok) {
    res.status(out.status).json({ message: out.message });
    return;
  }
  res.json(out);
};

export const crearCompra606DesdeArchivoHandler: RequestHandler = async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) {
    res.status(401).json({ message: "No autorizado." });
    return;
  }
  const file = req.file;
  if (!file?.buffer?.length) {
    res.status(400).json({ message: "Suba una imagen o PDF de la factura de compra." });
    return;
  }
  const periodo = String(req.body?.periodo ?? "").trim();
  const out = await crearCompra606DesdeArchivo(companyId, periodo, file.buffer, file.mimetype);
  if (!out.ok) {
    res.status(out.status).json({ message: out.message, texto_detectado: out.texto_detectado });
    return;
  }
  res.status(201).json({
    message: "Gasto registrado a partir del archivo.",
    compra: serializeCompra606(out.compra),
    texto_detectado: out.texto_detectado,
  });
};

export const deleteCompra606Handler: RequestHandler = async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) {
    res.status(401).json({ message: "No autorizado." });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ message: "Id inválido." });
    return;
  }
  const out = await deleteCompra606(companyId, id);
  if (!out.ok) {
    res.status(out.status).json({ message: out.message });
    return;
  }
  res.json({ message: "Registro eliminado." });
};
