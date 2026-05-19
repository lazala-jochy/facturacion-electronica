import { DOMParser } from "@xmldom/xmldom";
import { ECF_CONSUMO_RFCE_TOTAL_THRESHOLD_RD } from "../config/dgiiEcf.constants";
import { normalizeEcfTipo } from "./ecfTipo";
import { extractXmlTagValue } from "./ecfXmlExtract";

/** Denominación RI (Informe Técnico e-CF §18.2.1). */
export const ECF_TIPO_RI_LABELS: Record<string, string> = {
  "31": "Factura de Crédito Fiscal Electrónica",
  "32": "Factura de Consumo Electrónica",
  "33": "Nota de Débito Electrónica",
  "34": "Nota de Crédito Electrónica",
  "41": "Comprobante de Compras Electrónico",
  "43": "Gastos Menores Electrónico",
  "44": "Regímenes Especiales de Tributación Electrónico",
  "45": "Gubernamental Electrónico",
  "46": "Comprobante de Exportaciones Electrónico",
  "47": "Comprobante Electrónico para Pagos al Exterior",
};

const CODIGO_MODIFICACION_LABELS: Record<string, string> = {
  "1": "Anula el NCF modificado",
  "2": "Corrige texto del comprobante fiscal modificado",
  "3": "Corrige montos del NCF modificado",
  "4": "Reemplazo NCF emitido en contingencia",
};

const UNIDAD_MEDIDA_RI: Record<string, string> = {
  "43": "Unidad",
  "48": "Documento",
  "12": "Docena",
  "23": "Kilogramo",
  "29": "Litro",
  "36": "Metro",
  "41": "Caja",
};

/** Tabla codificación impuestos adicionales (Informe Técnico). */
const TIPO_IMPUESTO_CDT = new Set(["002", "004"]);
const TIPO_IMPUESTO_PROPINA = new Set(["007"]);

type XmlEl = {
  getElementsByTagName: (n: string) => { length: number; item: (i: number) => XmlEl | null };
  textContent: string | null;
};

export type RiItemRow = {
  numeroLinea: string;
  prefijoExento: "" | "E";
  nombreItem: string;
  cantidad: string;
  unidadCodigo: string;
  unidadLabel: string;
  gradosAlcohol: string;
  pvp: string;
  precioUnitario: string;
  iscEspecifico: string;
  iscAdValorem: string;
  itbisLinea: string;
  descuento: string;
  recargo: string;
  montoItem: string;
};

export type RiDescuentoRecargoGlobal = {
  descripcion: string;
  porcentaje: string;
  monto: string;
  esDescuento: boolean;
};

export type RiTotales = {
  subtotalGravado: string;
  subtotalExento: string;
  totalItbis: string;
  totalIsc: string;
  totalCdt: string;
  totalPropina: string;
  total: string;
  totalIsr: string;
};

export type RepresentacionImpresaData = {
  tipoEcf: string;
  tipoLabel: string;
  encf: string;
  fechaVencimientoSecuencia: string;
  ncfModificado: string;
  codigoModificacion: string;
  codigoModificacionLabel: string;
  emisor: {
    nombreComercial: string;
    razonSocial: string;
    sucursal: string;
    rnc: string;
    direccion: string;
    municipio: string;
    provincia: string;
    fechaEmision: string;
  };
  comprador: {
    razonSocial: string;
    rncCedula: string;
    identificadorExtranjero: string;
  };
  items: RiItemRow[];
  descuentosRecargosGlobales: RiDescuentoRecargoGlobal[];
  totales: RiTotales;
  fechaHoraFirma: string;
  esConsumoMenor250: boolean;
  tipoMoneda: string;
  dgiiTrackId?: string | null;
};

const itemChild = (item: XmlEl, name: string) => {
  const kids = item.getElementsByTagName(name);
  const first = kids.item(0);
  return (first?.textContent ?? "").trim();
};

const unidadRiLabel = (code: string) => {
  const c = code.trim();
  if (!c) return "";
  return UNIDAD_MEDIDA_RI[c] ?? c;
};

const indicadorEsExentoRi = (indicador: string) => {
  const v = indicador.trim();
  return v === "4" || v.toUpperCase() === "E";
};

const parseYyyymmddDisplay = (raw: string): string => {
  const t = raw.replace(/\D/g, "");
  if (t.length === 8) {
    return `${t.slice(6, 8)}-${t.slice(4, 6)}-${t.slice(0, 4)}`;
  }
  return raw.trim();
};

const sumImpuestoMonto = (el: XmlEl): number => {
  const parts = [
    itemChild(el, "MontoImpuestoSelectivoConsumoEspecifico"),
    itemChild(el, "MontoImpuestoSelectivoConsumoAdvalorem"),
    itemChild(el, "OtrosImpuestosAdicionales"),
  ];
  return parts.reduce((acc, p) => acc + (Number.parseFloat(p) || 0), 0);
};

type ItbisRates = { i1: number; i2: number; i3: number };

const parseItbisRatesFromDoc = (doc: XmlDoc): ItbisRates => ({
  i1: Number.parseFloat(extractXmlTagValueFromDoc(doc, "ITBIS1")) || 0,
  i2: Number.parseFloat(extractXmlTagValueFromDoc(doc, "ITBIS2")) || 0,
  i3: Number.parseFloat(extractXmlTagValueFromDoc(doc, "ITBIS3")) || 0,
});

const itbisRatePorIndicador = (indicador: string, rates: ItbisRates): number => {
  switch (indicador.trim()) {
    case "1":
      return rates.i1;
    case "2":
      return rates.i2;
    case "3":
      return rates.i3;
    default:
      return 0;
  }
};

const itbisLineaDesdeItem = (item: XmlEl, rates: ItbisRates): string => {
  const enXml = itemChild(item, "ITBISItem") || itemChild(item, "MontoITBIS");
  if (enXml.trim()) return enXml.trim();

  const indicador = itemChild(item, "IndicadorFacturacion");
  if (indicadorEsExentoRi(indicador)) return "";

  const tasa = itbisRatePorIndicador(indicador, rates);
  if (tasa <= 0) return "";

  const monto = Number.parseFloat(itemChild(item, "MontoItem")) || 0;
  const qty = Number.parseFloat(itemChild(item, "CantidadItem")) || 0;
  const precio = Number.parseFloat(itemChild(item, "PrecioUnitarioItem")) || 0;
  const base = monto > 0 ? monto : qty * precio;
  if (base <= 0) return "";

  return ((base * tasa) / 100).toFixed(2);
};

const parseItemImpuestos = (item: XmlEl) => {
  let iscEspecifico = 0;
  let iscAdValorem = 0;
  const impuestos = item.getElementsByTagName("ImpuestoAdicional");
  for (let j = 0; j < impuestos.length; j++) {
    const imp = impuestos.item(j);
    if (!imp) continue;
    const tipo = itemChild(imp, "TipoImpuesto");
    const espec = Number.parseFloat(itemChild(imp, "MontoImpuestoSelectivoConsumoEspecifico")) || 0;
    const adval = Number.parseFloat(itemChild(imp, "MontoImpuestoSelectivoConsumoAdvalorem")) || 0;
    if (TIPO_IMPUESTO_CDT.has(tipo) || TIPO_IMPUESTO_PROPINA.has(tipo)) continue;
    iscEspecifico += espec;
    iscAdValorem += adval;
  }
  return {
    iscEspecifico: iscEspecifico > 0 ? iscEspecifico.toFixed(2) : "",
    iscAdValorem: iscAdValorem > 0 ? iscAdValorem.toFixed(2) : "",
  };
};

type XmlDoc = {
  getElementsByTagName: (n: string) => { length: number; item: (i: number) => XmlEl | null };
};

const parseItems = (doc: XmlDoc): RiItemRow[] => {
  const itbisRates = parseItbisRatesFromDoc(doc);
  const items = doc.getElementsByTagName("Item");
  const rows: RiItemRow[] = [];
  for (let i = 0; i < items.length; i++) {
    const el = items.item(i) as XmlEl | null;
    if (!el) continue;
    const indicador = itemChild(el, "IndicadorFacturacion");
    const unidadCodigo = itemChild(el, "UnidadMedida");
    const { iscEspecifico, iscAdValorem } = parseItemImpuestos(el);
    rows.push({
      numeroLinea: itemChild(el, "NumeroLinea"),
      prefijoExento: indicadorEsExentoRi(indicador) ? "E" : "",
      nombreItem: itemChild(el, "NombreItem"),
      cantidad: itemChild(el, "CantidadItem"),
      unidadCodigo,
      unidadLabel: unidadRiLabel(unidadCodigo),
      gradosAlcohol: itemChild(el, "GradosAlcohol"),
      pvp: itemChild(el, "PrecioUnitarioReferencia"),
      precioUnitario: itemChild(el, "PrecioUnitarioItem"),
      iscEspecifico,
      iscAdValorem,
      itbisLinea: itbisLineaDesdeItem(el, itbisRates),
      descuento: itemChild(el, "DescuentoMonto") || itemChild(el, "MontoDescuento"),
      recargo: itemChild(el, "RecargoMonto") || itemChild(el, "MontoRecargo"),
      montoItem: itemChild(el, "MontoItem"),
    });
  }
  return rows;
};

const parseDescuentosRecargosGlobales = (doc: XmlDoc): RiDescuentoRecargoGlobal[] => {
  const out: RiDescuentoRecargoGlobal[] = [];
  const nodes = doc.getElementsByTagName("DescuentoORecargo");
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes.item(i) as XmlEl | null;
    if (!el) continue;
    const tipoAjuste = itemChild(el, "TipoAjuste");
    const monto = itemChild(el, "MontoDescuentooRecargo");
    const valor = itemChild(el, "ValorDescuentooRecargo");
    const descripcion = itemChild(el, "DescripcionDescuentooRecargo");
    const tipoValor = itemChild(el, "TipoValor");
    if (!monto && !valor && !descripcion) continue;
    out.push({
      descripcion,
      porcentaje: tipoValor === "2" || tipoValor === "%" ? valor : "",
      monto,
      esDescuento: tipoAjuste === "D" || tipoAjuste === "d",
    });
  }
  return out;
};

const parseTotalesImpuestosAdicionales = (doc: XmlDoc) => {
  let totalCdt = 0;
  let totalPropina = 0;
  let totalIscOtros = 0;
  const impuestos = doc.getElementsByTagName("ImpuestoAdicional");
  for (let i = 0; i < impuestos.length; i++) {
    const el = impuestos.item(i) as XmlEl | null;
    if (!el) continue;
    const tipo = itemChild(el, "TipoImpuesto");
    const monto = sumImpuestoMonto(el);
    if (!monto) continue;
    if (TIPO_IMPUESTO_CDT.has(tipo)) totalCdt += monto;
    else if (TIPO_IMPUESTO_PROPINA.has(tipo)) totalPropina += monto;
    else totalIscOtros += monto;
  }
  const montoImpAdicional = Number.parseFloat(extractXmlTagValueFromDoc(doc, "MontoImpuestoAdicional")) || 0;
  if (montoImpAdicional > 0 && totalIscOtros === 0 && totalCdt === 0 && totalPropina === 0) {
    totalIscOtros = montoImpAdicional;
  }
  return {
    totalCdt: totalCdt > 0 ? totalCdt.toFixed(2) : "",
    totalPropina: totalPropina > 0 ? totalPropina.toFixed(2) : "",
    totalIsc: totalIscOtros > 0 ? totalIscOtros.toFixed(2) : "",
  };
};

const extractXmlTagValueFromDoc = (doc: XmlDoc, tagName: string): string => {
  const nodes = doc.getElementsByTagName(tagName);
  const first = nodes.item(0);
  return (first?.textContent ?? "").trim();
};

const gravadoFromDoc = (doc: XmlDoc): string => {
  const parts = ["MontoGravadoTotal", "MontoGravadoI1", "MontoGravadoI2", "MontoGravadoI3"]
    .map((t) => extractXmlTagValueFromDoc(doc, t))
    .filter(Boolean);
  if (!parts.length) return "";
  const sum = parts.reduce((acc, p) => acc + (Number.parseFloat(p) || 0), 0);
  return sum > 0 ? sum.toFixed(2) : "";
};

const tipoFromXml = (signedXml: string, fallback: string): string => {
  const tipoe = extractXmlTagValue(signedXml, "TipoeCF");
  if (tipoe) return normalizeEcfTipo(tipoe);
  const encf = extractXmlTagValue(signedXml, "eNCF");
  const m = encf.match(/^E(\d{2})/i);
  if (m?.[1]) return normalizeEcfTipo(m[1]);
  return normalizeEcfTipo(fallback);
};

/** §18.2.1: no aplica fecha vencimiento secuencia en NC (34) ni consumo (32). */
const muestraFechaVencimientoSecuencia = (tipo: string) => tipo !== "32" && tipo !== "34";

export const parseRepresentacionImpresaData = (
  signedXml: string,
  ecfTipo: string,
  opts?: { dgiiTrackId?: string | null },
): RepresentacionImpresaData => {
  const xml = signedXml.replace(/^\uFEFF/, "");
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const tipo = tipoFromXml(signedXml, ecfTipo);
  const montoTotal = Number.parseFloat(extractXmlTagValueFromDoc(doc, "MontoTotal") || "0");
  const codigoMod = extractXmlTagValueFromDoc(doc, "CodigoModificacion");
  const compradorRnc = extractXmlTagValueFromDoc(doc, "RNCComprador");
  const idExt = extractXmlTagValueFromDoc(doc, "IdentificadorExtranjero");
  const impuestos = parseTotalesImpuestosAdicionales(doc);
  const fechaEmisionRaw = extractXmlTagValueFromDoc(doc, "FechaEmision");
  const fechaVencRaw = extractXmlTagValueFromDoc(doc, "FechaVencimientoSecuencia");
  const tipoMoneda =
    extractXmlTagValueFromDoc(doc, "TipoMoneda") ||
    extractXmlTagValueFromDoc(doc, "TipoMonedaOtraMoneda") ||
    "";

  return {
    tipoEcf: tipo,
    tipoLabel: ECF_TIPO_RI_LABELS[tipo] ?? `Comprobante Fiscal Electrónico (${tipo})`,
    encf: extractXmlTagValueFromDoc(doc, "eNCF"),
    fechaVencimientoSecuencia: muestraFechaVencimientoSecuencia(tipo)
      ? parseYyyymmddDisplay(fechaVencRaw)
      : "",
    ncfModificado: extractXmlTagValueFromDoc(doc, "NCFModificado"),
    codigoModificacion: codigoMod,
    codigoModificacionLabel: CODIGO_MODIFICACION_LABELS[codigoMod] ?? "",
    emisor: {
      nombreComercial: extractXmlTagValueFromDoc(doc, "NombreComercial"),
      razonSocial: extractXmlTagValueFromDoc(doc, "RazonSocialEmisor"),
      sucursal: extractXmlTagValueFromDoc(doc, "Sucursal"),
      rnc: extractXmlTagValueFromDoc(doc, "RNCEmisor"),
      direccion: extractXmlTagValueFromDoc(doc, "DireccionEmisor"),
      municipio: extractXmlTagValueFromDoc(doc, "Municipio"),
      provincia: extractXmlTagValueFromDoc(doc, "Provincia"),
      fechaEmision: parseYyyymmddDisplay(fechaEmisionRaw),
    },
    comprador: {
      razonSocial: extractXmlTagValueFromDoc(doc, "RazonSocialComprador"),
      rncCedula: compradorRnc,
      identificadorExtranjero: idExt,
    },
    items: parseItems(doc),
    descuentosRecargosGlobales: parseDescuentosRecargosGlobales(doc),
    totales: {
      subtotalGravado: gravadoFromDoc(doc),
      subtotalExento: extractXmlTagValueFromDoc(doc, "MontoExento"),
      totalItbis: extractXmlTagValueFromDoc(doc, "TotalITBIS"),
      totalIsc: impuestos.totalIsc || extractXmlTagValueFromDoc(doc, "MontoImpuestoAdicional"),
      totalCdt: impuestos.totalCdt,
      totalPropina: impuestos.totalPropina,
      total: extractXmlTagValueFromDoc(doc, "MontoTotal"),
      totalIsr: extractXmlTagValueFromDoc(doc, "TotalISRRetencion"),
    },
    fechaHoraFirma: extractXmlTagValueFromDoc(doc, "FechaHoraFirma"),
    esConsumoMenor250:
      tipo === "32" &&
      Number.isFinite(montoTotal) &&
      montoTotal < ECF_CONSUMO_RFCE_TOTAL_THRESHOLD_RD,
    tipoMoneda: tipoMoneda.trim(),
    dgiiTrackId: opts?.dgiiTrackId,
  };
};

export const formatRd = (raw: string, tipoMoneda?: string): string => {
  const t = raw.trim();
  if (!t) return "";
  const n = Number.parseFloat(t.replace(/,/g, ""));
  if (!Number.isFinite(n)) return t;
  const moneda = tipoMoneda?.trim();
  if (moneda && moneda !== "DOP" && moneda !== "214") {
    return `${moneda} ${n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `RD$ ${n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
