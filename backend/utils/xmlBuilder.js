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

const IDDOC_TAIL = [
  "TipoPago",
  "FechaLimitePago",
  "TerminoPago",
  "TipoCuentaPago",
  "NumeroCuentaPago",
  "BancoPago",
  "FechaDesde",
  "FechaHasta",
  "TotalPaginas",
];

/** Orden XSD IdDoc por tipo (desde fila Excel; solo se emiten campos con valor). */
const IDDOC_FIELDS_BY_TIPO = {
  "31": [
    "TipoeCF",
    "eNCF",
    "FechaVencimientoSecuencia",
    "IndicadorMontoGravado",
    "TipoIngresos",
    ...IDDOC_TAIL,
  ],
  "32": [
    "TipoeCF",
    "eNCF",
    "IndicadorEnvioDiferido",
    "IndicadorMontoGravado",
    "IndicadorServicioTodoIncluido",
    "TipoIngresos",
    ...IDDOC_TAIL,
  ],
  "33": [
    "TipoeCF",
    "eNCF",
    "FechaVencimientoSecuencia",
    "IndicadorMontoGravado",
    "TipoIngresos",
    ...IDDOC_TAIL,
  ],
  "34": ["TipoeCF", "eNCF", "IndicadorNotaCredito", "IndicadorMontoGravado", "TipoIngresos", ...IDDOC_TAIL],
  "41": [
    "TipoeCF",
    "eNCF",
    "FechaVencimientoSecuencia",
    "IndicadorMontoGravado",
    ...IDDOC_TAIL,
  ],
  "43": ["TipoeCF", "eNCF", "FechaVencimientoSecuencia", "TipoPago"],
  "44": ["TipoeCF", "eNCF", "FechaVencimientoSecuencia", "TipoIngresos", ...IDDOC_TAIL],
  "45": [
    "TipoeCF",
    "eNCF",
    "FechaVencimientoSecuencia",
    "IndicadorMontoGravado",
    "TipoIngresos",
    ...IDDOC_TAIL,
  ],
  "46": [
    "TipoeCF",
    "eNCF",
    "FechaVencimientoSecuencia",
    "IndicadorMontoGravado",
    "TipoIngresos",
    ...IDDOC_TAIL,
  ],
  "47": ["TipoeCF", "eNCF", "FechaVencimientoSecuencia", ...IDDOC_TAIL],
};

function idDocFieldsForTipoEcf(tipoEcf) {
  const t = String(tipoEcf ?? "").trim();
  return IDDOC_FIELDS_BY_TIPO[t] ?? IDDOC_FIELDS_BY_TIPO["31"];
}

/** e-CF 32: IndicadorEnvioDiferido=1 (cód. 164); IndicadorServicioTodoIncluido solo si vale 1 (XSD opcional — no enviar 0). */
function rowForIdDocFields(row, tipoEcf) {
  const t = String(tipoEcf ?? "").trim();
  if (t !== "32") return row;
  const out = { ...row };
  let servTodoIncl = null;
  for (const k of Object.keys(out)) {
    if (normCol(k) === normCol("IndicadorEnvioDiferido")) delete out[k];
    if (normCol(k) === normCol("IndicadorServicioTodoIncluido")) {
      const v = String(out[k] ?? "").trim();
      delete out[k];
      if (v === "1") servTodoIncl = "1";
    }
  }
  out.IndicadorEnvioDiferido = "1";
  if (servTodoIncl === "1") out.IndicadorServicioTodoIncluido = "1";
  return out;
}

const EMISOR_FIELDS = [
  "RNCEmisor",
  "RazonSocialEmisor",
  "NombreComercial",
  "Sucursal",
  "DireccionEmisor",
  "Municipio",
  "Provincia",
  "CorreoEmisor",
  "WebSite",
  "ActividadEconomica",
  "CodigoVendedor",
  "NumeroFacturaInterna",
  "NumeroPedidoInterno",
  "ZonaVenta",
  "RutaVenta",
  "InformacionAdicionalEmisor",
  "FechaEmision",
];

const COMPRADOR_FIELDS = [
  "RNCComprador",
  "IdentificadorExtranjero",
  "RazonSocialComprador",
  "ContactoComprador",
  "CorreoComprador",
  "DireccionComprador",
  "MunicipioComprador",
  "ProvinciaComprador",
  "PaisComprador",
  "FechaEntrega",
  "ContactoEntrega",
  "DireccionEntrega",
  "TelefonoAdicional",
  "FechaOrdenCompra",
  "NumeroOrdenCompra",
  "CodigoInternoComprador",
  "ResponsablePago",
  "InformacionAdicionalComprador",
];

const INFORMACIONES_ADICIONALES_FIELDS = [
  "FechaEmbarque",
  "NumeroEmbarque",
  "NumeroContenedor",
  "NumeroReferencia",
  "PesoBruto",
  "PesoNeto",
  "UnidadPesoBruto",
  "UnidadPesoNeto",
  "CantidadBulto",
  "UnidadBulto",
  "VolumenBulto",
  "UnidadVolumen",
];

const TRANSPORTE_FIELDS = [
  "Conductor",
  "DocumentoTransporte",
  "Ficha",
  "Placa",
  "RutaTransporte",
  "ZonaTransporte",
  "NumeroAlbaran",
];

const TOTALES_SIMPLE_BEFORE_IMPUESTOS = [
  "MontoGravadoTotal",
  "MontoGravadoI1",
  "MontoGravadoI2",
  "MontoGravadoI3",
  "MontoExento",
  "ITBIS1",
  "ITBIS2",
  "ITBIS3",
  "TotalITBIS",
  "TotalITBIS1",
  "TotalITBIS2",
  "TotalITBIS3",
  "MontoImpuestoAdicional",
];

const TOTALES_SIMPLE_AFTER_IMPUESTOS = [
  "MontoTotal",
  "MontoNoFacturable",
  "MontoPeriodo",
  "SaldoAnterior",
  "MontoAvancePago",
  "ValorPagar",
  "TotalITBISRetenido",
  "TotalISRRetencion",
  "TotalITBISPercepcion",
  "TotalISRPercepcion",
];

const OTRA_MONEDA_SIMPLE_BEFORE_IMPUESTOS = [
  "TipoMoneda",
  "TipoCambio",
  "MontoGravadoTotalOtraMoneda",
  "MontoGravado1OtraMoneda",
  "MontoGravado2OtraMoneda",
  "MontoGravado3OtraMoneda",
  "MontoExentoOtraMoneda",
  "TotalITBISOtraMoneda",
  "TotalITBIS1OtraMoneda",
  "TotalITBIS2OtraMoneda",
  "TotalITBIS3OtraMoneda",
  "MontoImpuestoAdicionalOtraMoneda",
];

const OTRA_MONEDA_SIMPLE_AFTER_IMPUESTOS = ["MontoTotalOtraMoneda"];

const ITEM_SIMPLE_FIELDS_BEFORE_DESCUENTO = [
  "NumeroLinea",
  "IndicadorFacturacion",
  "NombreItem",
  "IndicadorBienoServicio",
  "DescripcionItem",
  "CantidadItem",
  "UnidadMedida",
  "CantidadReferencia",
  "UnidadReferencia",
  "GradosAlcohol",
  "PrecioUnitarioReferencia",
  "FechaElaboracion",
  "FechaVencimientoItem",
  "PrecioUnitarioItem",
  "DescuentoMonto",
];

const ITEM_SIMPLE_FIELDS_AFTER_RECARDO = ["RecargoMonto"];
const ITEM_FINAL_FIELDS = ["MontoItem"];
const ITEM_FIELD_BASES = [
  "NumeroLinea",
  "TipoCodigo",
  "CodigoItem",
  "IndicadorFacturacion",
  "IndicadorAgenteRetencionoPercepcion",
  "MontoITBISRetenido",
  "MontoISRRetenido",
  "NombreItem",
  "IndicadorBienoServicio",
  "DescripcionItem",
  "CantidadItem",
  "UnidadMedida",
  "CantidadReferencia",
  "UnidadReferencia",
  "Subcantidad",
  "CodigoSubcantidad",
  "GradosAlcohol",
  "PrecioUnitarioReferencia",
  "FechaElaboracion",
  "FechaVencimientoItem",
  "PrecioUnitarioItem",
  "DescuentoMonto",
  "TipoSubDescuento",
  "SubDescuentoPorcentaje",
  "MontoSubDescuento",
  "RecargoMonto",
  "TipoSubRecargo",
  "SubRecargoPorcentaje",
  "MontosubRecargo",
  "TipoImpuesto",
  "PrecioOtraMoneda",
  "DescuentoOtraMoneda",
  "RecargoOtraMoneda",
  "MontoItemOtraMoneda",
  "MontoItem",
].map(normCol);
const INFORMACION_REFERENCIA_FIELDS = [
  "NCFModificado",
  "RNCOtroContribuyente",
  "FechaNCFModificado",
  "CodigoModificacion",
  "RazonModificacion",
];

/** Campos indexados [n] de DescuentosORecargos (Excel lote DGII). */
const DESCUENTO_RECARGO_FIELD_BASES = [
  "TIPOAJUSTE",
  "INDICADORNORMA1007",
  "DESCRIPCIONDESCUENTOORECARGO",
  "TIPOVALOR",
  "VALORDESCUENTOORECARGO",
  "MONTODESCUENTOORECARGO",
  "MONTODESCUENTOORECARGOOTRAMONEDA",
  "INDICADORFACTURACIONDESCUENTOORECARGO",
  "NUMEROLINEADOR",
].map(normCol);

function exactLookup(row, wanted) {
  const wantedNorm = normCol(wanted);
  for (const [key, value] of Object.entries(row)) {
    if (normCol(key) === wantedNorm) {
      const text = String(value ?? "").trim();
      return text && text !== "#e" ? text : null;
    }
  }
  return null;
}

function xmlFieldName(excelName) {
  if (normCol(excelName) === "ENCF") return "eNCF";
  if (normCol(excelName) === "MONTOSUBRECARGO") return "MontoSubRecargo";
  return excelName;
}

function appendIfPresent(parent, row, field, opts = {}) {
  const value = exactLookup(row, field);
  if (value == null) return false;
  parent.ele(opts.xmlName || xmlFieldName(field)).txt(value);
  return true;
}

function appendFields(parent, row, fields) {
  let wrote = false;
  for (const field of fields) {
    wrote = appendIfPresent(parent, row, field) || wrote;
  }
  return wrote;
}

function appendOptionalGroup(parent, groupName, row, fields) {
  const group = parent.ele(groupName);
  const wrote = appendFields(group, row, fields);
  if (!wrote) group.remove();
  return wrote;
}

function appendIndexedPairGroup(parent, row, groupName, itemName, index, fields) {
  const item = parent.ele(itemName);
  let wrote = false;
  for (const field of fields) {
    wrote = appendIfPresent(item, row, `${field}[${index}]`) || wrote;
  }
  if (!wrote) item.remove();
  return wrote;
}

function appendNestedIndexedPairGroup(parent, row, groupName, itemName, lineIndex, max, fields) {
  const group = parent.ele(groupName);
  let wroteGroup = false;
  for (let i = 1; i <= max; i++) {
    const item = group.ele(itemName);
    let wroteItem = false;
    for (const field of fields) {
      wroteItem =
        appendIfPresent(item, row, `${field}[${lineIndex}][${i}]`, { xmlName: xmlFieldName(field) }) ||
        wroteItem;
    }
    if (!wroteItem) item.remove();
    wroteGroup = wroteItem || wroteGroup;
  }
  if (!wroteGroup) group.remove();
  return wroteGroup;
}

function appendTablaFormasPago(parent, row) {
  const group = parent.ele("TablaFormasPago");
  let wrote = false;
  for (let i = 1; i <= 7; i++) {
    const item = group.ele("FormaDePago");
    const hasForma = appendIfPresent(item, row, `FormaPago[${i}]`, { xmlName: "FormaPago" });
    const hasMonto = appendIfPresent(item, row, `MontoPago[${i}]`, { xmlName: "MontoPago" });
    if (!hasForma && !hasMonto) item.remove();
    wrote = hasForma || hasMonto || wrote;
  }
  if (!wrote) group.remove();
}

function appendTablaTelefonoEmisor(parent, row) {
  const group = parent.ele("TablaTelefonoEmisor");
  let wrote = false;
  for (let i = 1; i <= 3; i++) {
    const value = exactLookup(row, `TelefonoEmisor[${i}]`);
    if (!value) continue;
    group.ele("TelefonoEmisor").txt(value);
    wrote = true;
  }
  if (!wrote) group.remove();
}

function appendImpuestosAdicionales(parent, row, opts = {}) {
  const suffix = opts.suffix || "";
  const groupName = opts.groupName || "ImpuestosAdicionales";
  const itemName = opts.itemName || "ImpuestoAdicional";
  const group = parent.ele(groupName);
  let wrote = false;
  for (let i = 1; i <= 20; i++) {
    const item = group.ele(itemName);
    const fields = [
      `TipoImpuesto${suffix}`,
      `TasaImpuestoAdicional${suffix}`,
      `MontoImpuestoSelectivoConsumoEspecifico${suffix}`,
      `MontoImpuestoSelectivoConsumoAdvalorem${suffix}`,
      `OtrosImpuestosAdicionales${suffix}`,
    ];
    let wroteItem = false;
    for (const field of fields) {
      wroteItem = appendIfPresent(item, row, `${field}[${i}]`, { xmlName: field }) || wroteItem;
    }
    if (!wroteItem) item.remove();
    wrote = wroteItem || wrote;
  }
  if (!wrote) group.remove();
  return wrote;
}

/**
 * `TipoImpuesto` existe a nivel Encabezado (`TipoImpuesto[i]`, Impuestos Adicionales) y a nivel
 * de línea (`TipoImpuesto[lineIndex][i]`, TablaImpuestoAdicional del ítem). Solo la forma anidada
 * de dos índices cuenta como dato de línea; de lo contrario `TipoImpuesto[2]` (2do impuesto del
 * encabezado) se confunde con la línea 2 y genera un `<Item>` vacío que invalida el XML ante DGII.
 */
function itemHasAnyValue(row, lineIndex) {
  return Object.entries(row).some(([key, value]) => {
    const text = String(value ?? "").trim();
    if (!text || text === "#e") return false;
    const nested = String(key).match(/^(.+?)\[(\d+)\]\[(\d+)\]$/);
    if (nested) {
      return Number(nested[2]) === lineIndex && normCol(nested[1]) === normCol("TipoImpuesto");
    }
    const match = String(key).match(/^(.+?)\[(\d+)\]$/);
    if (!match) return false;
    if (normCol(match[1]) === normCol("TipoImpuesto")) return false;
    return Number(match[2]) === lineIndex && ITEM_FIELD_BASES.includes(normCol(match[1]));
  });
}

function descuentoRecargoHasAnyValue(row, index) {
  return Object.entries(row).some(([key, value]) => {
    const text = String(value ?? "").trim();
    if (!text || text === "#e") return false;
    const match = String(key).match(/^(.+?)\[(\d+)\]/);
    if (!match) return false;
    return Number(match[2]) === index && DESCUENTO_RECARGO_FIELD_BASES.includes(normCol(match[1]));
  });
}

/** ECF > DescuentosORecargos (después de DetallesItems, antes de InformacionReferencia). */
function appendDescuentosORecargos(root, row) {
  const group = root.ele("DescuentosORecargos");
  let wrote = false;
  for (let i = 1; i <= 20; i++) {
    if (!descuentoRecargoHasAnyValue(row, i)) continue;
    const tipoAjuste = exactLookup(row, `TipoAjuste[${i}]`);
    if (!tipoAjuste) continue;

    const item = group.ele("DescuentoORecargo");
    const numeroLinea = exactLookup(row, `NumeroLineaDoR[${i}]`) || String(i);
    item.ele("NumeroLinea").txt(numeroLinea);
    item.ele("TipoAjuste").txt(tipoAjuste);
    appendIfPresent(item, row, `IndicadorNorma1007[${i}]`, { xmlName: "IndicadorNorma1007" });
    appendIfPresent(item, row, `DescripcionDescuentooRecargo[${i}]`, {
      xmlName: "DescripcionDescuentooRecargo",
    });
    appendIfPresent(item, row, `TipoValor[${i}]`, { xmlName: "TipoValor" });
    appendIfPresent(item, row, `ValorDescuentooRecargo[${i}]`, { xmlName: "ValorDescuentooRecargo" });
    appendIfPresent(item, row, `MontoDescuentooRecargo[${i}]`, { xmlName: "MontoDescuentooRecargo" });
    appendIfPresent(item, row, `MontoDescuentooRecargoOtraMoneda[${i}]`, {
      xmlName: "MontoDescuentooRecargoOtraMoneda",
    });
    appendIfPresent(item, row, `IndicadorFacturacionDescuentooRecargo[${i}]`, {
      xmlName: "IndicadorFacturacionDescuentooRecargo",
    });
    item.up();
    wrote = true;
  }
  if (!wrote) group.remove();
  return wrote;
}

/**
 * @param {Record<string, string>} row
 * @param {{ defaultRncEmisor?: string; tipoEcf?: string }} [opts]
 * @returns {{ xml: string, enf: string }}
 */
function buildEcfXml(row, opts = {}) {
  const enf = exactLookup(row, "ENCF") || resolveEncf(row);
  if (!enf) {
    throw new Error("Fila sin eNCF reconocido (columna ENCF / patrón E…).");
  }
  const tipoEcf = String(exactLookup(row, "TipoeCF") || opts.tipoEcf || enf.slice(1, 3)).trim();

  const doc = create({ version: "1.0", encoding: "UTF-8" });
  const root = doc.ele("ECF");

  const enc = root.ele("Encabezado");
  enc.ele("Version").txt(String(exactLookup(row, "Version") || "1.0"));

  const idDoc = enc.ele("IdDoc");
  appendFields(idDoc, rowForIdDocFields(row, tipoEcf), idDocFieldsForTipoEcf(tipoEcf));
  appendTablaFormasPago(idDoc, row);
  idDoc.up();

  const em = enc.ele("Emisor");
  for (const field of EMISOR_FIELDS) {
    if (field === "CorreoEmisor") appendTablaTelefonoEmisor(em, row);
    appendIfPresent(em, row, field);
  }
  em.up();

  if (tipoEcf !== "43") {
    const comp = enc.ele("Comprador");
    const wroteComprador = appendFields(comp, row, COMPRADOR_FIELDS);
    if (!wroteComprador && ["33", "34", "47"].includes(tipoEcf)) {
      comp.remove();
    } else {
      comp.up();
    }
  }

  appendOptionalGroup(enc, "InformacionesAdicionales", row, INFORMACIONES_ADICIONALES_FIELDS);
  appendOptionalGroup(enc, "Transporte", row, TRANSPORTE_FIELDS);

  const totales = enc.ele("Totales");
  appendFields(totales, row, TOTALES_SIMPLE_BEFORE_IMPUESTOS);
  appendImpuestosAdicionales(totales, row);
  appendFields(totales, row, TOTALES_SIMPLE_AFTER_IMPUESTOS);
  totales.up();

  const otraMoneda = enc.ele("OtraMoneda");
  const wroteOtraMonedaBefore = appendFields(otraMoneda, row, OTRA_MONEDA_SIMPLE_BEFORE_IMPUESTOS);
  const wroteOtraMonedaImpuestos = appendImpuestosAdicionales(otraMoneda, row, {
    suffix: "OtraMoneda",
    groupName: "ImpuestosAdicionalesOtraMoneda",
    itemName: "ImpuestoAdicionalOtraMoneda",
  });
  const wroteOtraMonedaAfter = appendFields(otraMoneda, row, OTRA_MONEDA_SIMPLE_AFTER_IMPUESTOS);
  if (!wroteOtraMonedaBefore && !wroteOtraMonedaImpuestos && !wroteOtraMonedaAfter) {
    otraMoneda.remove();
  }

  enc.up();

  const detalles = root.ele("DetallesItems");
  let itemCount = 0;
  for (let lineIndex = 1; lineIndex <= 1000; lineIndex++) {
    if (!itemHasAnyValue(row, lineIndex)) continue;
    const item = detalles.ele("Item");
    appendIfPresent(item, row, `NumeroLinea[${lineIndex}]`, { xmlName: "NumeroLinea" });
    appendNestedIndexedPairGroup(item, row, "TablaCodigosItem", "CodigosItem", lineIndex, 5, [
      "TipoCodigo",
      "CodigoItem",
    ]);
    appendIfPresent(item, row, `IndicadorFacturacion[${lineIndex}]`, { xmlName: "IndicadorFacturacion" });
    const retencion = item.ele("Retencion");
    let wroteRetencion = false;
    for (const field of [
      "IndicadorAgenteRetencionoPercepcion",
      "MontoITBISRetenido",
      "MontoISRRetenido",
    ]) {
      wroteRetencion =
        appendIfPresent(retencion, row, `${field}[${lineIndex}]`, { xmlName: field }) ||
        wroteRetencion;
    }
    if (!wroteRetencion) retencion.remove();
    for (const field of [
      "NombreItem",
      "IndicadorBienoServicio",
      "DescripcionItem",
      "CantidadItem",
      "UnidadMedida",
      "CantidadReferencia",
      "UnidadReferencia",
    ]) {
      appendIfPresent(item, row, `${field}[${lineIndex}]`, { xmlName: field });
    }
    appendNestedIndexedPairGroup(item, row, "TablaSubcantidad", "SubcantidadItem", lineIndex, 5, [
      "Subcantidad",
      "CodigoSubcantidad",
    ]);
    for (const field of ["GradosAlcohol", "PrecioUnitarioReferencia", "FechaElaboracion", "FechaVencimientoItem", "PrecioUnitarioItem", "DescuentoMonto"]) {
      appendIfPresent(item, row, `${field}[${lineIndex}]`, { xmlName: field });
    }
    appendNestedIndexedPairGroup(item, row, "TablaSubDescuento", "SubDescuento", lineIndex, 12, [
      "TipoSubDescuento",
      "SubDescuentoPorcentaje",
      "MontoSubDescuento",
    ]);
    appendIfPresent(item, row, `RecargoMonto[${lineIndex}]`, { xmlName: "RecargoMonto" });
    appendNestedIndexedPairGroup(item, row, "TablaSubRecargo", "SubRecargo", lineIndex, 12, [
      "TipoSubRecargo",
      "SubRecargoPorcentaje",
      "MontosubRecargo",
    ]);
    appendNestedIndexedPairGroup(item, row, "TablaImpuestoAdicional", "ImpuestoAdicional", lineIndex, 2, [
      "TipoImpuesto",
    ]);
    const otraMonedaDetalle = item.ele("OtraMonedaDetalle");
    let wroteOtraMonedaDetalle = false;
    for (const field of ["PrecioOtraMoneda", "DescuentoOtraMoneda", "RecargoOtraMoneda", "MontoItemOtraMoneda"]) {
      wroteOtraMonedaDetalle =
        appendIfPresent(otraMonedaDetalle, row, `${field}[${lineIndex}]`, { xmlName: field }) ||
        wroteOtraMonedaDetalle;
    }
    if (!wroteOtraMonedaDetalle) otraMonedaDetalle.remove();
    appendIfPresent(item, row, `MontoItem[${lineIndex}]`, { xmlName: "MontoItem" });
    item.up();
    itemCount += 1;
  }
  if (itemCount === 0) {
    throw new Error(`Fila ${enf} sin DetallesItems.`);
  }
  detalles.up();

  appendDescuentosORecargos(root, row);

  appendOptionalGroup(root, "InformacionReferencia", row, INFORMACION_REFERENCIA_FIELDS);
  root.ele("FechaHoraFirma").txt(fechaHoraFirmaDgii());

  const xml = doc.end({ prettyPrint: true });
  return { xml, enf };
}

/** Alias retrocompatible con el runner / API. */
function buildFacturaElectronicaXml(row, opts) {
  return buildEcfXml(row, opts);
}

/**
 * Builds RFCE XML (Resumen Factura de Consumo Electrónica) for consumer invoices < RD$250K.
 * Per RFCE 32 v1.0 XSD: RFCE > Encabezado (IdDoc, Emisor, Comprador, Totales, CodigoSeguridadeCF) + xs:any (Signature).
 * @param {Record<string, string>} row
 * @param {{ defaultRncEmisor?: string; codigoSeguridadeCF?: string }} [opts]
 * @returns {{ xml: string, enf: string }}
 */
function buildRfceXml(row, opts = {}) {
  const enf = exactLookup(row, "ENCF") || resolveEncf(row);
  if (!enf) {
    throw new Error("Fila RFCE sin eNCF reconocido (columna ENCF / patrón E…).");
  }

  const doc = create({ version: "1.0", encoding: "UTF-8" });
  const root = doc.ele("RFCE");

  const enc = root.ele("Encabezado");
  enc.ele("Version").txt(String(exactLookup(row, "Version") || "1.0"));

  const idDoc = enc.ele("IdDoc");
  appendIfPresent(idDoc, row, "TipoeCF");
  idDoc.ele("eNCF").txt(enf);
  appendIfPresent(idDoc, row, "TipoIngresos");
  appendIfPresent(idDoc, row, "TipoPago");
  appendTablaFormasPago(idDoc, row);
  idDoc.up();

  const em = enc.ele("Emisor");
  const rnc = exactLookup(row, "RNCEmisor") || opts.defaultRncEmisor || "";
  if (rnc) em.ele("RNCEmisor").txt(rnc);
  appendIfPresent(em, row, "RazonSocialEmisor");
  appendIfPresent(em, row, "FechaEmision");
  em.up();

  const comp = enc.ele("Comprador");
  appendIfPresent(comp, row, "RNCComprador");
  appendIfPresent(comp, row, "IdentificadorExtranjero");
  appendIfPresent(comp, row, "RazonSocialComprador");
  comp.up();

  const totales = enc.ele("Totales");
  appendFields(totales, row, TOTALES_SIMPLE_BEFORE_IMPUESTOS);
  appendFields(totales, row, TOTALES_SIMPLE_AFTER_IMPUESTOS);
  totales.up();

  enc.ele("CodigoSeguridadeCF").txt(opts.codigoSeguridadeCF || "");

  enc.up();

  const xml = doc.end({ prettyPrint: true });
  return { xml, enf };
}

module.exports = {
  DGII_NS,
  buildEcfXml,
  buildFacturaElectronicaXml,
  buildRfceXml,
  lookup,
  resolveMontoTotalNumeric,
  sumMontoItemsFromRow,
  fechaHoraFirmaDgii,
  fechaEmisionDdMmYyyy,
};
