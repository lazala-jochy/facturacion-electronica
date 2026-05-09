/**
 * Construye XML e-CF DGII con raíz <ECF>, Encabezado, DetallesItems y FechaHoraFirma (sin firma).
 */

const { create } = require("xmlbuilder2");

const DGII_NS = "http://www.dgii.gov.do/ecf";

const SYN_VERSION = ["VERSION"];
const SYN_TIPOECF = ["TIPOECF", "TIPO_ECF", "TIPOE_CF", "TYPECF"];
const SYN_ENCF = ["ENCF", "NumeroeCF", "NUMERO_ENCF"];
const SYN_TIPO_INGRESOS = ["TIPOINGRESOS", "TIPO_INGRESOS"];
const SYN_TIPO_PAGO = ["TIPOPAGO", "TIPO_PAGO"];
const SYN_RNC = ["RNCEMISOR", "RNC_EMISOR", "RNC", "RNCEMISOR"];
const SYN_RAZON_SOCIAL_EMISOR = ["RAZONSOCIALEMISOR", "RAZON_SOCIAL_EMISOR"];
const SYN_NOMBRE_COMERCIAL = ["NOMBRECOMERCIAL", "NOMBRE_COMERCIAL"];
const SYN_DIRECCION_EMISOR = ["DIRECCIONEMISOR", "DIRECCION_EMISOR"];
const SYN_MUNICIPIO = ["MUNICIPIO", "MUNICIPIOEMISOR"];
const SYN_PROVINCIA = ["PROVINCIA", "PROVINCIAEMISOR"];
const SYN_CORREO_EMISOR = ["CORREOEMISOR", "CORREO_EMISOR", "EMAILEMISOR"];
const SYN_FECHA_EMISION = ["FECHAEMISION", "FECHA_EMISION"];
const SYN_RNC_COMPRADOR = ["RNCCOMPRADOR", "RNC_COMPRADOR", "RNCCLIENTE"];
const SYN_RAZON_COMPRADOR = ["RAZONSOCIALCOMPRADOR", "RAZON_SOCIAL_COMPRADOR"];

const SYN_MONTO_PAGO1 = [
  "MONTOPAGO1",
  "MONTOPAGO_1",
  "MONTOPAGO[1]",
  "MONTOPAGO (1)",
  "MONTO_PAGO_1",
];
const SYN_MONTO_TOTAL = ["MONTOTOTAL", "MONTO_TOTAL", "TOTAL", "MONTO"];
const SYN_MONTO_NO_FACTURABLE = [
  "MONTONOFACTURABLE",
  "MONTO_NO_FACTURABLE",
  "MONTONOFACT",
];

const SYN_NOMBRE_ITEM = [
  "NOMBREITEM",
  "NOMBRE_ITEM",
  "DESCRIPCION",
  "DESCRIPCIONLINEA",
  "DESCRIPCION_LINEA",
  "ITEM",
];
const SYN_CANTIDAD = ["CANTIDADITEM", "CANTIDAD_ITEM", "CANTIDAD"];
const SYN_PRECIO_UNIT = [
  "PRECIOUNITARIOITEM",
  "PRECIO_UNITARIO_ITEM",
  "PRECIOUNITARIO",
  "PRECIO_UNITARIO",
];
const SYN_MONTO_ITEM = ["MONTOITEM", "MONTO_ITEM", "MONTO_LINEA", "MONTO"];
const SYN_IND_FACTURACION = ["INDICADORFACTURACION"];
const SYN_IND_BIEN = ["INDICADORBIENOSERVICIO", "INDICADORBIENOSSERVICIO"];
const SYN_UNIDAD_MEDIDA = ["UNIDADMEDIDA", "UNIDAD_MEDIDA"];

/** Orden canónico DGII del bloque Emisor. */
const EMISOR_FIELD_ORDER = [
  "RNCEmisor",
  "RazonSocialEmisor",
  "NombreComercial",
  "DireccionEmisor",
  "Municipio",
  "Provincia",
  "CorreoEmisor",
  "FechaEmision",
];

/** Orden canónico DGII del bloque Item. */
const ITEM_FIELD_ORDER = [
  "NumeroLinea",
  "IndicadorFacturacion",
  "NombreItem",
  "IndicadorBienoServicio",
  "CantidadItem",
  "UnidadMedida",
  "PrecioUnitarioItem",
  "MontoItem",
];

/**
 * @param {string} s
 */
function normCol(s) {
  return String(s)
    .replace(/#e/gi, "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * @param {Record<string, string>} row
 * @param {string[]} synonyms
 * @param {number} lineIndex
 */
function lookupIndexed(row, synonyms, lineIndex) {
  const extra = [];
  for (const base of synonyms) {
    const b = base.toUpperCase().replace(/\s+/g, "");
    extra.push(`${b}[${lineIndex}]`, `${b}${lineIndex}`);
  }
  return lookup(row, [...extra, ...synonyms]);
}

/**
 * @param {Record<string, string>} row
 * @param {string[]} synonyms
 */
function lookup(row, synonyms) {
  /** @type {Record<string, string>} */
  const index = {};
  for (const [k, v] of Object.entries(row)) {
    if (!v.trim()) continue;
    index[normCol(k)] = v.trim();
  }
  for (const alias of synonyms) {
    const u = alias.toUpperCase().replace(/\s+/g, "");
    if (index[u]) return index[u];
  }
  for (const alias of synonyms) {
    const a = alias.toUpperCase().replace(/\s+/g, "");
    for (const nk of Object.keys(index)) {
      if (nk.includes(a) || a.includes(nk)) return index[nk];
    }
  }
  return null;
}

/**
 * @param {Record<string, string>} row
 */
function resolveEncf(row) {
  let v = lookup(row, SYN_ENCF);
  if (v && /^E\d/i.test(v)) return v;
  for (const val of Object.values(row)) {
    const t = String(val).trim();
    if (/^E\d{12,}/i.test(t)) return t;
  }
  return v;
}

/**
 * @param {string} raw
 * @returns {number}
 */
function parseMoneyNumber(raw) {
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function formatMoney2(n) {
  return round2(n).toFixed(2);
}

function sumMontoItemsFromRow(row) {
  let sum = 0;
  for (const [k, v] of Object.entries(row)) {
    const nk = normCol(k);
    if (!/^MONTOITEM(\[\d+\]|\d+)?$/.test(nk)) continue;
    const n = parseMoneyNumber(v);
    if (Number.isFinite(n)) sum += n;
  }
  return round2(sum);
}

function resolveMontoTotalNumeric(row) {
  const rawPrimary = lookup(row, SYN_MONTO_PAGO1) || lookup(row, SYN_MONTO_TOTAL);
  let n = rawPrimary != null && String(rawPrimary).trim() !== "" ? parseMoneyNumber(rawPrimary) : NaN;

  if (Number.isFinite(n) && n > 0) {
    return n;
  }

  const fromLines = sumMontoItemsFromRow(row);
  if (fromLines > 0) {
    return fromLines;
  }

  const rawNoFact = lookup(row, SYN_MONTO_NO_FACTURABLE);
  n = rawNoFact != null && String(rawNoFact).trim() !== "" ? parseMoneyNumber(rawNoFact) : NaN;
  if (Number.isFinite(n) && n > 0) {
    return n;
  }

  const shown = rawPrimary ?? rawNoFact ?? "";
  throw new Error(
    `Monto total inválido o 0 (${shown}). Revise MontoTotal, MontoPago1, MontoItem[n] o MontoNoFacturable.`,
  );
}

/** Fecha emisión mostrada DD-MM-YYYY (Emisor); prioriza Excel. */
function fechaEmisionDdMmYyyy(row) {
  const fromExcel = lookup(row, SYN_FECHA_EMISION);
  if (fromExcel) {
    const t = String(fromExcel).trim();
    if (/^\d{2}-\d{2}-\d{4}$/.test(t)) {
      return t;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      const [y, m, d] = t.split("-");
      return `${d}-${m}-${y}`;
    }
  }
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const y = d.getFullYear();
  return `${dd}-${mm}-${y}`;
}

/** FechaHoraFirma: DD-MM-YYYY HH:mm:ss (no ISO). */
function fechaHoraFirmaDgii() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const y = d.getFullYear();
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${dd}-${mm}-${y} ${h}:${mi}:${s}`;
}

function formatQtyDisplay(val, fallbackNum) {
  const n = parseMoneyNumber(val);
  if (Number.isFinite(n) && n > 0) {
    return Number.isInteger(n) ? `${n}.00` : n.toFixed(2);
  }
  return formatMoney2(fallbackNum ?? 1);
}

/**
 * Inserta elementos en el orden exacto especificado por `order`.
 * @param {import("xmlbuilder2/lib/interfaces").XMLBuilder} parent
 * @param {Record<string, string>} values
 * @param {string[]} order
 */
function appendFieldsInOrder(parent, values, order) {
  for (const key of order) {
    parent.ele(key).txt(values[key] ?? "");
  }
}

/**
 * @param {Record<string, string>} row
 * @param {{ defaultRncEmisor?: string; tipoEcf?: string }} [opts]
 * @returns {{ xml: string, enf: string }}
 */
function buildEcfXml(row, opts = {}) {
  const version = lookup(row, SYN_VERSION) || "1.0";
  const tipoFromOpts = typeof opts.tipoEcf === "string" ? opts.tipoEcf.trim() : "";
  const tipoFromEnv =
    typeof process.env.DGII_TIPOECF === "string" ? process.env.DGII_TIPOECF.trim() : "";
  /** Prioridad: `opts.tipoEcf` &gt; `DGII_TIPOECF` en entorno &gt; columna Excel TipoeCF. */
  const tipoeCf =
    tipoFromOpts || tipoFromEnv || lookup(row, SYN_TIPOECF);
  const enf = resolveEncf(row);
  const tipoIngresos = lookup(row, SYN_TIPO_INGRESOS) || "01";
  const tipoPago = lookup(row, SYN_TIPO_PAGO) || "1";

  const rncFromRow = lookup(row, SYN_RNC);
  const defaultRnc = (opts.defaultRncEmisor || process.env.DGII_RNC_EMISOR || "").trim();
  const rncEmisor = (rncFromRow && rncFromRow.trim()) || defaultRnc;

  const razonSocialEmisor = lookup(row, SYN_RAZON_SOCIAL_EMISOR);
  const nombreComercial =
    lookup(row, SYN_NOMBRE_COMERCIAL) || razonSocialEmisor || "N/A";
  const direccionEmisor = lookup(row, SYN_DIRECCION_EMISOR);
  const municipio =
    lookup(row, SYN_MUNICIPIO) || (process.env.DGII_EMISOR_MUNICIPIO || "").trim() || "010100";
  const provincia =
    lookup(row, SYN_PROVINCIA) || (process.env.DGII_EMISOR_PROVINCIA || "").trim() || "010000";
  const correoEmisor = lookup(row, SYN_CORREO_EMISOR);

  const rncComprador = lookup(row, SYN_RNC_COMPRADOR);
  const razonComprador = lookup(row, SYN_RAZON_COMPRADOR);

  if (!enf) {
    throw new Error("Fila sin eNCF reconocido (columna ENCF / patrón E…).");
  }
  if (!tipoeCf) {
    throw new Error("Fila sin TipoeCF.");
  }
  if (!rncEmisor) {
    throw new Error(
      "Falta RNCEmisor: columna en Excel o variable de entorno DGII_RNC_EMISOR.",
    );
  }
  if (!razonSocialEmisor) {
    throw new Error("Falta RazonSocialEmisor en el Excel.");
  }
  if (!direccionEmisor) {
    throw new Error("Falta DireccionEmisor en el Excel.");
  }
  if (!correoEmisor) {
    throw new Error("Falta CorreoEmisor en el Excel.");
  }
  if (!rncComprador) {
    throw new Error("Falta RNCComprador en el Excel.");
  }
  if (!razonComprador) {
    throw new Error("Falta RazonSocialComprador en el Excel.");
  }

  const montoNum = resolveMontoTotalNumeric(row);
  const montoTotalStr = formatMoney2(montoNum);

  const nombreItem =
    lookupIndexed(row, SYN_NOMBRE_ITEM, 1) || lookup(row, SYN_NOMBRE_ITEM) || "Servicio";
  const cantidadRaw = lookupIndexed(row, SYN_CANTIDAD, 1) || lookup(row, SYN_CANTIDAD) || "1";
  const cantidadDisplay = formatQtyDisplay(cantidadRaw, 1);

  let precioUnitStr =
    lookupIndexed(row, SYN_PRECIO_UNIT, 1) || lookup(row, SYN_PRECIO_UNIT);
  let montoItemStr =
    lookupIndexed(row, SYN_MONTO_ITEM, 1) || lookup(row, SYN_MONTO_ITEM);
  if (!precioUnitStr) {
    precioUnitStr = montoTotalStr;
  }
  if (!montoItemStr) {
    montoItemStr = montoTotalStr;
  }
  precioUnitStr = formatMoney2(parseMoneyNumber(precioUnitStr) || montoNum);
  montoItemStr = formatMoney2(parseMoneyNumber(montoItemStr) || montoNum);

  const indicadorFacturacion =
    lookupIndexed(row, SYN_IND_FACTURACION, 1) || lookup(row, SYN_IND_FACTURACION) || "4";
  const indicadorBienServicio =
    lookupIndexed(row, SYN_IND_BIEN, 1) || lookup(row, SYN_IND_BIEN) || "1";
  const unidadMedida =
    lookupIndexed(row, SYN_UNIDAD_MEDIDA, 1) || lookup(row, SYN_UNIDAD_MEDIDA) || "47";

  const doc = create({ version: "1.0", encoding: "UTF-8" });
  const root = doc.ele("ECF", { xmlns: DGII_NS });

  const enc = root.ele("Encabezado");
  enc.ele("Version").txt(String(version));

  const idDoc = enc.ele("IdDoc");
  idDoc.ele("TipoeCF").txt(String(tipoeCf));
  idDoc.ele("eNCF").txt(String(enf));
  idDoc.ele("TipoIngresos").txt(String(tipoIngresos));
  idDoc.ele("TipoPago").txt(String(tipoPago));
  idDoc.up();

  const em = enc.ele("Emisor");
  appendFieldsInOrder(
    em,
    {
      RNCEmisor: String(rncEmisor),
      RazonSocialEmisor: String(razonSocialEmisor),
      NombreComercial: String(nombreComercial),
      DireccionEmisor: String(direccionEmisor),
      Municipio: String(municipio),
      Provincia: String(provincia),
      CorreoEmisor: String(correoEmisor),
      FechaEmision: fechaEmisionDdMmYyyy(row),
    },
    EMISOR_FIELD_ORDER,
  );
  em.up();

  const comp = enc.ele("Comprador");
  comp.ele("RNCComprador").txt(String(rncComprador));
  comp.ele("RazonSocialComprador").txt(String(razonComprador));
  comp.up();

  enc.ele("Totales").ele("MontoTotal").txt(montoTotalStr).up();

  enc.up();

  const detalles = root.ele("DetallesItems");
  const item = detalles.ele("Item");
  appendFieldsInOrder(
    item,
    {
      NumeroLinea: "1",
      IndicadorFacturacion: String(indicadorFacturacion),
      NombreItem: String(nombreItem),
      IndicadorBienoServicio: String(indicadorBienServicio),
      CantidadItem: cantidadDisplay,
      UnidadMedida: String(unidadMedida),
      PrecioUnitarioItem: precioUnitStr,
      MontoItem: montoItemStr,
    },
    ITEM_FIELD_ORDER,
  );
  item.up();
  detalles.up();

  root.ele("FechaHoraFirma").txt(fechaHoraFirmaDgii());

  const xml = doc.end({ prettyPrint: true });
  return { xml, enf };
}

/** Alias retrocompatible con el runner / API. */
function buildFacturaElectronicaXml(row, opts) {
  return buildEcfXml(row, opts);
}

module.exports = {
  DGII_NS,
  buildEcfXml,
  buildFacturaElectronicaXml,
  lookup,
  resolveMontoTotalNumeric,
  sumMontoItemsFromRow,
  fechaHoraFirmaDgii,
  fechaEmisionDdMmYyyy,
};
