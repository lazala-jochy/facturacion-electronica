import fs from "node:fs/promises";
import path from "node:path";
import type { Compra606, Cotizacion } from "@prisma/client";
import {
  isValid606FormaPago,
  isValid606TipoBienes,
} from "../config/dgiiFormato606";
import { ECF_CONSUMO_RFCE_TOTAL_THRESHOLD_RD } from "../config/dgiiEcf.constants";
import { prisma } from "../prisma";
import { extraerTextoDeArchivo, parseFacturaCompraTexto } from "../utils/compra606Extract";
import { buildEcfNumber } from "../utils/ecfTipo";
import { extractXmlTagValue } from "../utils/ecfXmlExtract";
import {
  build606Txt,
  build607Txt,
  dgiiFormatoTxtFilename,
  dgiiTipoIdentificacion,
  mapFormaPago606,
  mapFormaPago607,
  parsePeriodoParam,
  type Linea606,
  type Linea607,
  type PeriodoFormato,
} from "../utils/dgiiFormato606607";

type CotizacionVentas = Cotizacion & {
  client: { name: string; rncCedula: string };
};

const periodoRange = (periodo: PeriodoFormato): { from: Date; to: Date } => {
  const from = new Date(Date.UTC(periodo.year, periodo.month - 1, 1, 0, 0, 0));
  const to = new Date(Date.UTC(periodo.year, periodo.month, 1, 0, 0, 0));
  return { from, to };
};

const fechaYyyymmddFromCotizacion = (cot: CotizacionVentas): string => {
  if (cot.signedXml?.trim()) {
    // <FechaEmision> del e-CF siempre viene en dd-MM-AAAA (XSD DGII); reordenar sin adivinar.
    const raw = extractXmlTagValue(cot.signedXml, "FechaEmision");
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 8) {
      return `${digits.slice(4, 8)}${digits.slice(2, 4)}${digits.slice(0, 2)}`;
    }
  }
  const d = cot.dgiiSubmittedAt ?? cot.createdAt;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}${m}${day}`;
};

const encfFromCotizacion = (cot: CotizacionVentas): string => {
  if (cot.signedXml?.trim()) {
    const encf = extractXmlTagValue(cot.signedXml, "eNCF");
    if (encf) return encf;
  }
  return buildEcfNumber(cot.ecfTipo, cot.ecfNcfSeq);
};

const parseXmlAmount = (signedXml: string, tag: string): number => {
  const raw = extractXmlTagValue(signedXml, tag).replace(/,/g, "");
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
};

const motivoExclusion607 = (cot: CotizacionVentas): string => {
  const st = cot.dgiiStatus?.trim() ?? "";
  if (st !== "accepted") {
    return st ? `DGII: ${st}` : "Sin envío aceptado a DGII";
  }
  if (cot.ecfTipo === "32" && cot.total < ECF_CONSUMO_RFCE_TOTAL_THRESHOLD_RD) {
    return "Consumo < RD$250,000 (no va en 607; va en RFCE)";
  }
  return "";
};

const incluirEn607 = (cot: CotizacionVentas): boolean => motivoExclusion607(cot) === "";

export type Fuente607Cotizacion = {
  cotizacion_id: number;
  number: number;
  client_name: string;
  client_rnc_cedula: string;
  encf: string;
  ecf_tipo: string;
  dgii_status: string | null;
  fecha_emision: string;
  subtotal: number;
  itbis: number;
  total: number;
  included: boolean;
  exclude_reason: string | null;
};

export const cotizacionToLinea607 = (cot: CotizacionVentas): Linea607 => {
  const id = dgiiTipoIdentificacion(cot.client.rncCedula);
  const xml = cot.signedXml?.trim() ?? "";
  const tipoIngreso = (xml && extractXmlTagValue(xml, "TipoIngresos")) || "01";
  const pagos = mapFormaPago607(cot.paymentMethod, cot.total);
  const itbisRet = xml ? parseXmlAmount(xml, "TotalITBISRetenido") : 0;
  const isrRet = xml ? parseXmlAmount(xml, "TotalISRRetencion") : 0;
  const isc = xml ? parseXmlAmount(xml, "MontoImpuestoAdicional") : 0;
  const propina = xml ? parseXmlAmount(xml, "TotalPropinaLegal") : 0;
  return {
    rncCedula: id.rncCedula,
    tipoIdentificacion: id.tipo,
    ncf: encfFromCotizacion(cot),
    ncfModificado: cot.ecfReferenceNcf?.trim() || undefined,
    // Formato 607 exige "Tipo de Ingreso" de 1 solo dígito (1-6); el e-CF trae "01"-"06".
    tipoIngreso: String(Number.parseInt(tipoIngreso, 10) || 1),
    fechaComprobante: fechaYyyymmddFromCotizacion(cot),
    montoFacturado: cot.subtotal,
    itbisFacturado: cot.itbis,
    itbisRetenidoPorTerceros: itbisRet > 0 ? itbisRet : undefined,
    retencionRentaPorTerceros: isrRet > 0 ? isrRet : undefined,
    impuestoIsc: isc > 0 ? isc : undefined,
    montoPropinaLegal: propina > 0 ? propina : undefined,
    ...pagos,
  };
};

const fuente607FromCotizacion = (cot: CotizacionVentas): Fuente607Cotizacion => {
  const reason = motivoExclusion607(cot);
  return {
    cotizacion_id: cot.id,
    number: cot.number,
    client_name: cot.client.name,
    client_rnc_cedula: cot.client.rncCedula,
    encf: encfFromCotizacion(cot),
    ecf_tipo: cot.ecfTipo,
    dgii_status: cot.dgiiStatus,
    fecha_emision: fechaYyyymmddFromCotizacion(cot),
    subtotal: cot.subtotal,
    itbis: cot.itbis,
    total: cot.total,
    included: reason === "",
    exclude_reason: reason || null,
  };
};

export const collect607LinesFromCotizaciones = async (
  companyId: number,
  periodo: PeriodoFormato,
): Promise<Linea607[]> => {
  const periodoStr = `${periodo.year}-${String(periodo.month).padStart(2, "0")}`;
  const out = await llenar607DesdeEcf(companyId, periodoStr);
  if (!out.ok) return [];
  return out.lines;
};

/** Origen 607: cotizaciones / e-CF aceptados por DGII en el periodo. */
export const llenar607DesdeEcf = async (companyId: number, periodoRaw: string) => {
  const periodo = parsePeriodoParam(periodoRaw);
  if (!periodo) return { ok: false as const, status: 400, message: "Periodo inválido (use YYYY-MM)." };

  const { from, to } = periodoRange(periodo);
  const rows = await prisma.cotizacion.findMany({
    where: {
      companyId,
      OR: [
        { dgiiSubmittedAt: { gte: from, lt: to } },
        { createdAt: { gte: from, lt: to } },
      ],
    },
    include: { client: true },
    orderBy: [{ dgiiSubmittedAt: "asc" }, { createdAt: "asc" }],
  });

  const included: Fuente607Cotizacion[] = [];
  const excluded: Fuente607Cotizacion[] = [];
  const lines: Linea607[] = [];

  for (const cot of rows) {
    const fuente = fuente607FromCotizacion(cot);
    if (fuente.included) {
      included.push(fuente);
      lines.push(cotizacionToLinea607(cot));
    } else {
      excluded.push(fuente);
    }
  }

  const totalMonto = lines.reduce((a, l) => a + l.montoFacturado, 0);
  const totalItbis = lines.reduce((a, l) => a + l.itbisFacturado, 0);

  return {
    ok: true as const,
    periodo: periodoRaw,
    fuente: "ecf_cotizaciones" as const,
    descripcion:
      "Ventas (607) desde e-CF emitidos y aceptados por DGII: cliente, e-NCF, montos e ITBIS del XML firmado.",
    registro_count: lines.length,
    total_monto_facturado: round2(totalMonto),
    total_itbis: round2(totalItbis),
    lines,
    fuentes_incluidas: included,
    fuentes_excluidas: excluded,
  };
};

export type Borrador606 = {
  rnc_cedula: string;
  tipo_bienes_servicios: string;
  ncf: string;
  ncf_modificado: string;
  fecha_comprobante: string;
  fecha_pago: string;
  monto_servicios: number;
  monto_bienes: number;
  itbis_facturado: number;
  forma_pago: string;
  aviso: string | null;
  origen: "cliente" | "cotizacion" | "archivo";
  origen_id: number;
  referencia_venta_encf: string | null;
  /** Solo cuando origen = "archivo": texto crudo detectado, para verificar campos que la heurística no ubicó. */
  texto_detectado?: string;
};

/** Borrador 606: datos del cliente (proveedor) en el maestro de clientes. */
export const borrador606DesdeCliente = async (companyId: number, clientId: number) => {
  const client = await prisma.client.findFirst({ where: { id: clientId, companyId } });
  if (!client) return { ok: false as const, status: 404, message: "Cliente no encontrado." };
  const borrador: Borrador606 = {
    rnc_cedula: client.rncCedula,
    tipo_bienes_servicios: "02",
    ncf: "",
    ncf_modificado: "",
    fecha_comprobante: "",
    fecha_pago: "",
    monto_servicios: 0,
    monto_bienes: 0,
    itbis_facturado: 0,
    forma_pago: "04",
    aviso: "Ingrese el NCF del comprobante de compra del proveedor (no es el e-NCF de venta).",
    origen: "cliente",
    origen_id: client.id,
    referencia_venta_encf: null,
  };
  return { ok: true as const, borrador };
};

/** Borrador 606: copia montos/fechas de una venta e-CF (solo ayuda; el NCF de compra lo debe ingresar usted). */
export const borrador606DesdeCotizacion = async (companyId: number, cotizacionId: number) => {
  const cot = await prisma.cotizacion.findFirst({
    where: { id: cotizacionId, companyId },
    include: { client: true },
  });
  if (!cot) return { ok: false as const, status: 404, message: "Cotización no encontrada." };

  const xml = cot.signedXml?.trim() ?? "";
  const borrador: Borrador606 = {
    rnc_cedula: cot.client.rncCedula,
    tipo_bienes_servicios: "02",
    ncf: "",
    ncf_modificado: cot.ecfReferenceNcf?.trim() ?? "",
    fecha_comprobante: fechaYyyymmddFromCotizacion(cot),
    fecha_pago: "",
    monto_servicios: cot.subtotal,
    monto_bienes: 0,
    itbis_facturado: cot.itbis,
    forma_pago: mapFormaPago606(cot.paymentMethod),
    aviso:
      "Montos copiados de una venta (e-CF). Debe ingresar el NCF de la factura de compra del proveedor; el e-NCF de venta no aplica al 606.",
    origen: "cotizacion",
    origen_id: cot.id,
    referencia_venta_encf: encfFromCotizacion(cot),
  };
  if (xml) {
    borrador.itbis_facturado =
      parseXmlAmount(xml, "TotalITBIS") || cot.itbis;
  }
  return { ok: true as const, borrador };
};

/** Borrador 606 desde una imagen o PDF de la factura de compra (OCR + heurística; siempre a revisar). */
export const borrador606DesdeArchivo = async (
  buffer: Buffer,
  mimetype: string,
): Promise<
  | { ok: false; status: number; message: string }
  | { ok: true; borrador: Borrador606 }
> => {
  let texto: string;
  try {
    texto = await extraerTextoDeArchivo(buffer, mimetype);
  } catch (e) {
    return { ok: false, status: 400, message: e instanceof Error ? e.message : "No se pudo leer el archivo." };
  }

  const campos = parseFacturaCompraTexto(texto);
  const faltantes: string[] = [];
  if (!campos.rnc_cedula) faltantes.push("RNC/Cédula");
  if (!campos.ncf) faltantes.push("NCF");
  if (!campos.fecha_comprobante) faltantes.push("fecha");
  if (campos.monto_servicios <= 0 && campos.itbis_facturado <= 0) faltantes.push("montos");

  const borrador: Borrador606 = {
    rnc_cedula: campos.rnc_cedula,
    tipo_bienes_servicios: "02",
    ncf: campos.ncf,
    ncf_modificado: "",
    fecha_comprobante: campos.fecha_comprobante,
    fecha_pago: "",
    monto_servicios: campos.monto_servicios,
    monto_bienes: campos.monto_bienes,
    itbis_facturado: campos.itbis_facturado,
    forma_pago: campos.forma_pago,
    aviso:
      faltantes.length > 0
        ? `Datos extraídos por OCR — no se detectó: ${faltantes.join(", ")}. Revise y complete el formulario antes de guardar.`
        : "Datos extraídos por OCR. Verifique todos los campos (especialmente NCF y montos) antes de guardar.",
    origen: "archivo",
    origen_id: 0,
    referencia_venta_encf: null,
    texto_detectado: texto.trim(),
  };
  return { ok: true, borrador };
};

export const compra606ToLinea = (row: Compra606): Linea606 => {
  const id = dgiiTipoIdentificacion(row.rncCedula);
  return {
    rncCedula: id.rncCedula,
    tipoIdentificacion: id.tipo,
    tipoBienesServicios: row.tipoBienesServicios,
    ncf: row.ncf,
    ncfModificado: row.ncfModificado ?? undefined,
    fechaComprobante: row.fechaComprobante,
    fechaPago: row.fechaPago ?? undefined,
    montoServicios: row.montoServicios,
    montoBienes: row.montoBienes,
    montoFacturado: row.montoFacturado,
    itbisFacturado: row.itbisFacturado,
    itbisRetenido: row.itbisRetenido,
    itbisSujetoProporcionalidad: row.itbisSujetoProporcionalidad,
    itbisLlevadoAlCosto: row.itbisLlevadoAlCosto,
    itbisPorAdelantar: row.itbisPorAdelantar,
    itbisPercibidoCompras: row.itbisPercibidoCompras,
    tipoRetencionIsr: row.tipoRetencionIsr ?? undefined,
    retencionRenta: row.retencionRenta,
    isrPercibidoCompras: row.isrPercibidoCompras,
    impuestoIsc: row.impuestoIsc,
    impuestosOtros: row.impuestosOtros,
    montoPropinaLegal: row.montoPropinaLegal,
    formaPago: row.formaPago,
  };
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const resolveMontos606 = (input: CreateCompra606Input) => {
  const servicios = round2(input.monto_servicios ?? 0);
  const bienes = round2(input.monto_bienes ?? 0);
  const totalInput = round2(input.monto_facturado ?? 0);
  if (servicios + bienes > 0) {
    return { montoServicios: servicios, montoBienes: bienes, montoFacturado: round2(servicios + bienes) };
  }
  if (totalInput > 0) {
    return { montoServicios: totalInput, montoBienes: 0, montoFacturado: totalInput };
  }
  return { montoServicios: 0, montoBienes: 0, montoFacturado: 0 };
};

export const listCompras606 = async (companyId: number, periodoRaw: string) => {
  const periodo = parsePeriodoParam(periodoRaw);
  if (!periodo) return { ok: false as const, status: 400, message: "Periodo inválido (use YYYY-MM)." };
  const aaaamm = `${periodo.year}${String(periodo.month).padStart(2, "0")}`;
  const rows = await prisma.compra606.findMany({
    where: { companyId, periodo: aaaamm },
    orderBy: { id: "asc" },
  });
  return { ok: true as const, compras: rows, periodo: periodoRaw };
};

export type CreateCompra606Input = {
  rnc_cedula: string;
  tipo_bienes_servicios?: string;
  ncf: string;
  ncf_modificado?: string;
  fecha_comprobante: string;
  fecha_pago?: string;
  monto_servicios?: number;
  monto_bienes?: number;
  monto_facturado?: number;
  itbis_facturado?: number;
  itbis_retenido?: number;
  itbis_sujeto_proporcionalidad?: number;
  itbis_llevado_al_costo?: number;
  itbis_por_adelantar?: number;
  itbis_percibido_compras?: number;
  retencion_renta?: number;
  tipo_retencion_isr?: string;
  isr_percibido_compras?: number;
  impuesto_isc?: number;
  impuestos_otros?: number;
  monto_propina_legal?: number;
  forma_pago?: string;
};

export const createCompra606 = async (
  companyId: number,
  periodoRaw: string,
  input: CreateCompra606Input,
) => {
  const periodo = parsePeriodoParam(periodoRaw);
  if (!periodo) return { ok: false as const, status: 400, message: "Periodo inválido (use YYYY-MM)." };
  const ncf = input.ncf?.trim();
  if (!ncf) return { ok: false as const, status: 400, message: "NCF es obligatorio." };
  const fechaComprobante = input.fecha_comprobante.replace(/\D/g, "");
  if (fechaComprobante.length !== 8) {
    return { ok: false as const, status: 400, message: "Fecha comprobante debe ser AAAAMMDD (8 dígitos)." };
  }
  const tipoBienes = (input.tipo_bienes_servicios ?? "02").trim();
  if (!isValid606TipoBienes(tipoBienes)) {
    return { ok: false as const, status: 400, message: "Tipo bienes y servicios comprados inválido (01-11)." };
  }
  const formaPago = (input.forma_pago ?? "04").trim();
  if (!isValid606FormaPago(formaPago)) {
    return { ok: false as const, status: 400, message: "Forma de pago inválida (01-07)." };
  }
  const montos = resolveMontos606(input);
  if (montos.montoFacturado <= 0) {
    return { ok: false as const, status: 400, message: "Indique montos en servicios/bienes o total facturado." };
  }
  const fechaPago = input.fecha_pago?.replace(/\D/g, "") || null;
  if (fechaPago && fechaPago.length !== 8) {
    return { ok: false as const, status: 400, message: "Fecha pago debe ser AAAAMMDD (8 dígitos)." };
  }
  const aaaamm = `${periodo.year}${String(periodo.month).padStart(2, "0")}`;
  const row = await prisma.compra606.create({
    data: {
      companyId,
      periodo: aaaamm,
      rncCedula: input.rnc_cedula.trim(),
      tipoBienesServicios: tipoBienes,
      ncf,
      ncfModificado: input.ncf_modificado?.trim() || null,
      fechaComprobante,
      fechaPago,
      montoServicios: montos.montoServicios,
      montoBienes: montos.montoBienes,
      montoFacturado: montos.montoFacturado,
      itbisFacturado: input.itbis_facturado ?? 0,
      itbisRetenido: input.itbis_retenido ?? 0,
      itbisSujetoProporcionalidad: input.itbis_sujeto_proporcionalidad ?? 0,
      itbisLlevadoAlCosto: input.itbis_llevado_al_costo ?? 0,
      itbisPorAdelantar: input.itbis_por_adelantar ?? 0,
      itbisPercibidoCompras: input.itbis_percibido_compras ?? 0,
      retencionRenta: input.retencion_renta ?? 0,
      tipoRetencionIsr: input.tipo_retencion_isr?.trim() || null,
      isrPercibidoCompras: input.isr_percibido_compras ?? 0,
      impuestoIsc: input.impuesto_isc ?? 0,
      impuestosOtros: input.impuestos_otros ?? 0,
      montoPropinaLegal: input.monto_propina_legal ?? 0,
      formaPago,
    },
  });
  return { ok: true as const, compra: row };
};

/** Extrae por OCR y guarda directo (sin pantalla de revisión); si falta un dato obligatorio, falla con detalle. */
export const crearCompra606DesdeArchivo = async (
  companyId: number,
  periodoRaw: string,
  buffer: Buffer,
  mimetype: string,
): Promise<
  | { ok: false; status: number; message: string; texto_detectado?: string }
  | { ok: true; compra: Compra606; texto_detectado: string }
> => {
  const extraido = await borrador606DesdeArchivo(buffer, mimetype);
  if (!extraido.ok) return extraido;

  const b = extraido.borrador;
  const guardado = await createCompra606(companyId, periodoRaw, {
    rnc_cedula: b.rnc_cedula,
    tipo_bienes_servicios: b.tipo_bienes_servicios,
    ncf: b.ncf,
    fecha_comprobante: b.fecha_comprobante,
    monto_servicios: b.monto_servicios,
    monto_bienes: b.monto_bienes,
    itbis_facturado: b.itbis_facturado,
    forma_pago: b.forma_pago,
  });
  if (!guardado.ok) {
    return {
      ok: false,
      status: guardado.status,
      message: `No se pudo registrar el gasto automáticamente: ${guardado.message} ${b.aviso}`,
      texto_detectado: b.texto_detectado,
    };
  }
  return { ok: true, compra: guardado.compra, texto_detectado: b.texto_detectado ?? "" };
};

export const deleteCompra606 = async (companyId: number, id: number) => {
  const row = await prisma.compra606.findFirst({ where: { id, companyId } });
  if (!row) return { ok: false as const, status: 404, message: "Registro no encontrado." };
  await prisma.compra606.delete({ where: { id } });
  return { ok: true as const };
};

export const previewFormato = async (
  companyId: number,
  tipo: "606" | "607",
  periodoRaw: string,
) => {
  const periodo = parsePeriodoParam(periodoRaw);
  if (!periodo) return { ok: false as const, status: 400, message: "Periodo inválido (use YYYY-MM)." };
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return { ok: false as const, status: 404, message: "Empresa no encontrada." };

  if (tipo === "607") {
    const lines = await collect607LinesFromCotizaciones(companyId, periodo);
    const totalMonto = lines.reduce((a, l) => a + l.montoFacturado, 0);
    const totalItbis = lines.reduce((a, l) => a + l.itbisFacturado, 0);
    return {
      ok: true as const,
      tipo,
      periodo: periodoRaw,
      registro_count: lines.length,
      total_monto_facturado: Math.round(totalMonto * 100) / 100,
      total_itbis: Math.round(totalItbis * 100) / 100,
      lines_preview: lines.slice(0, 20),
    };
  }

  const aaaamm = `${periodo.year}${String(periodo.month).padStart(2, "0")}`;
  const compras = await prisma.compra606.findMany({
    where: { companyId, periodo: aaaamm },
  });
  const lines = compras.map(compra606ToLinea);
  const totalMonto = lines.reduce((a, l) => a + l.montoFacturado, 0);
  return {
    ok: true as const,
    tipo,
    periodo: periodoRaw,
    registro_count: lines.length,
    total_monto_facturado: Math.round(totalMonto * 100) / 100,
    lines_preview: lines.slice(0, 20),
  };
};

export const generateFormatoTxt = async (
  companyId: number,
  tipo: "606" | "607",
  periodoRaw: string,
): Promise<
  | { ok: false; status: number; message: string }
  | { ok: true; content: string; filename: string; registro_count: number }
> => {
  const periodo = parsePeriodoParam(periodoRaw);
  if (!periodo) return { ok: false, status: 400, message: "Periodo inválido (use YYYY-MM)." };
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company?.rnc?.trim()) {
    return { ok: false, status: 400, message: "Configure el RNC de la empresa en Perfil." };
  }

  if (tipo === "607") {
    const lines = await collect607LinesFromCotizaciones(companyId, periodo);
    const content = build607Txt(company.rnc, periodo, lines);
    return {
      ok: true,
      content,
      filename: dgiiFormatoTxtFilename("607", company.rnc, periodo),
      registro_count: lines.length,
    };
  }

  const aaaamm = `${periodo.year}${String(periodo.month).padStart(2, "0")}`;
  const compras = await prisma.compra606.findMany({
    where: { companyId, periodo: aaaamm },
    orderBy: { id: "asc" },
  });
  const lines = compras.map(compra606ToLinea);
  const content = build606Txt(company.rnc, periodo, lines);
  return {
    ok: true,
    content,
    filename: dgiiFormatoTxtFilename("606", company.rnc, periodo),
    registro_count: lines.length,
  };
};

export const persistFormatoTxt = async (
  uploadsRoot: string,
  companyId: number,
  tipo: "606" | "607",
  periodoRaw: string,
  content: string,
  filename: string,
): Promise<string> => {
  const rel = path.join("dgii-formatos", String(companyId), periodoRaw, filename);
  const abs = path.join(uploadsRoot, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
  return rel.replace(/\\/g, "/");
};

/** Prepara envío: genera TXT, guarda copia y devuelve instrucciones OFV (sin API pública DGII). */
export const prepareFormatoEnvio = async (
  companyId: number,
  tipo: "606" | "607",
  periodoRaw: string,
  uploadsRoot: string,
) => {
  const gen = await generateFormatoTxt(companyId, tipo, periodoRaw);
  if (!gen.ok) return gen;
  const relPath = await persistFormatoTxt(
    uploadsRoot,
    companyId,
    tipo,
    periodoRaw,
    gen.content,
    gen.filename,
  );
  return {
    ok: true as const,
    tipo,
    periodo: periodoRaw,
    filename: gen.filename,
    registro_count: gen.registro_count,
    stored_path: relPath,
    manual_upload_required: true,
    message:
      "Archivo TXT generado. La DGII no publica API para formatos 606/607: pre-valide el archivo con la herramienta de la DGII y envíelo en Oficina Virtual → Formatos de Envío → Enviar archivos.",
    ofv_url: "https://dgii.gov.do/ofv/",
    prevalidacion_url:
      "https://dgii.gov.do/cicloContribuyente/obligacionesTributarias/remisionInformacion/Paginas/formatoEnvioDatos.aspx",
  };
};
