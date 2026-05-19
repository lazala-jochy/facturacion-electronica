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

export type RiItemRow = {
  numeroLinea: string;
  prefijoExento: "" | "E";
  nombreItem: string;
  cantidad: string;
  unidadCodigo: string;
  unidadLabel: string;
  precioUnitario: string;
  montoItem: string;
  itbisLinea: string;
  descuento: string;
  recargo: string;
};

export type RiTotales = {
  subtotalGravado: string;
  subtotalExento: string;
  totalItbis: string;
  totalIsc: string;
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
  totales: RiTotales;
  fechaHoraFirma: string;
  esConsumoMenor250: boolean;
  dgiiTrackId?: string | null;
};

const itemChild = (item: { getElementsByTagName: (n: string) => { item: (i: number) => { textContent: string | null } | null } }, name: string) => {
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

const gravadoFromXml = (signedXml: string): string => {
  const parts = [
    extractXmlTagValue(signedXml, "MontoGravadoTotal"),
    extractXmlTagValue(signedXml, "MontoGravadoI1"),
    extractXmlTagValue(signedXml, "MontoGravadoI2"),
    extractXmlTagValue(signedXml, "MontoGravadoI3"),
  ].filter(Boolean);
  if (!parts.length) return "";
  const sum = parts.reduce((acc, p) => acc + (Number.parseFloat(p) || 0), 0);
  return sum > 0 ? sum.toFixed(2) : "";
};

const parseItems = (signedXml: string): RiItemRow[] => {
  const doc = new DOMParser().parseFromString(signedXml.replace(/^\uFEFF/, ""), "text/xml");
  const items = doc.getElementsByTagName("Item");
  const rows: RiItemRow[] = [];
  for (let i = 0; i < items.length; i++) {
    const el = items.item(i);
    if (!el) continue;
    const indicador = itemChild(el, "IndicadorFacturacion");
    const unidadCodigo = itemChild(el, "UnidadMedida");
    rows.push({
      numeroLinea: itemChild(el, "NumeroLinea"),
      prefijoExento: indicadorEsExentoRi(indicador) ? "E" : "",
      nombreItem: itemChild(el, "NombreItem"),
      cantidad: itemChild(el, "CantidadItem"),
      unidadCodigo,
      unidadLabel: unidadRiLabel(unidadCodigo),
      precioUnitario: itemChild(el, "PrecioUnitarioItem"),
      montoItem: itemChild(el, "MontoItem"),
      itbisLinea: itemChild(el, "ITBISItem") || itemChild(el, "MontoITBIS"),
      descuento: itemChild(el, "DescuentoMonto") || itemChild(el, "MontoDescuento"),
      recargo: itemChild(el, "RecargoMonto") || itemChild(el, "MontoRecargo"),
    });
  }
  return rows;
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
  const tipo = tipoFromXml(signedXml, ecfTipo);
  const montoTotal = Number.parseFloat(extractXmlTagValue(signedXml, "MontoTotal") || "0");
  const codigoMod = extractXmlTagValue(signedXml, "CodigoModificacion");
  const compradorRnc = extractXmlTagValue(signedXml, "RNCComprador");
  const idExt = extractXmlTagValue(signedXml, "IdentificadorExtranjero");

  return {
    tipoEcf: tipo,
    tipoLabel: ECF_TIPO_RI_LABELS[tipo] ?? `Comprobante Fiscal Electrónico (${tipo})`,
    encf: extractXmlTagValue(signedXml, "eNCF"),
    fechaVencimientoSecuencia: muestraFechaVencimientoSecuencia(tipo)
      ? extractXmlTagValue(signedXml, "FechaVencimientoSecuencia")
      : "",
    ncfModificado: extractXmlTagValue(signedXml, "NCFModificado"),
    codigoModificacion: codigoMod,
    codigoModificacionLabel: CODIGO_MODIFICACION_LABELS[codigoMod] ?? "",
    emisor: {
      nombreComercial: extractXmlTagValue(signedXml, "NombreComercial"),
      razonSocial: extractXmlTagValue(signedXml, "RazonSocialEmisor"),
      rnc: extractXmlTagValue(signedXml, "RNCEmisor"),
      direccion: extractXmlTagValue(signedXml, "DireccionEmisor"),
      municipio: extractXmlTagValue(signedXml, "Municipio"),
      provincia: extractXmlTagValue(signedXml, "Provincia"),
      fechaEmision: extractXmlTagValue(signedXml, "FechaEmision"),
    },
    comprador: {
      razonSocial: extractXmlTagValue(signedXml, "RazonSocialComprador"),
      rncCedula: compradorRnc,
      identificadorExtranjero: idExt,
    },
    items: parseItems(signedXml),
    totales: {
      subtotalGravado: gravadoFromXml(signedXml),
      subtotalExento: extractXmlTagValue(signedXml, "MontoExento"),
      totalItbis: extractXmlTagValue(signedXml, "TotalITBIS"),
      totalIsc: extractXmlTagValue(signedXml, "MontoImpuestoAdicional"),
      total: extractXmlTagValue(signedXml, "MontoTotal"),
      totalIsr: extractXmlTagValue(signedXml, "TotalISRRetencion"),
    },
    fechaHoraFirma: extractXmlTagValue(signedXml, "FechaHoraFirma"),
    esConsumoMenor250:
      tipo === "32" &&
      Number.isFinite(montoTotal) &&
      montoTotal < ECF_CONSUMO_RFCE_TOTAL_THRESHOLD_RD,
    dgiiTrackId: opts?.dgiiTrackId,
  };
};

export const formatRd = (raw: string): string => {
  const t = raw.trim();
  if (!t) return "";
  const n = Number.parseFloat(t.replace(/,/g, ""));
  if (!Number.isFinite(n)) return t;
  return `RD$ ${n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
