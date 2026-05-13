/**
 * Parser Excel DGII: detecta .xlsx en /assets, hojas "eCF" (principal) y "rFCE" (complemento por fila).
 * Omite celdas vacías, columnas cuyo nombre contiene "#e" y valores iguales a "#e".
 */

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

/**
 * @param {Record<string, unknown>} row
 * @returns {Record<string, string>}
 */
function dropHashEFields(row) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, raw] of Object.entries(row)) {
    if (String(key).includes("#e")) continue;
    const v = raw === null || raw === undefined ? "" : String(raw).trim();
    if (v === "" || v === "#e") continue;
    out[String(key).trim()] = v;
  }
  return out;
}

/**
 * @param {Record<string, string>} cleanRow
 * @returns {boolean}
 */
function rowIsEffectivelyEmpty(cleanRow) {
  return Object.keys(cleanRow).length === 0;
}

/**
 * @param {string} assetsDir
 * @returns {string}
 */
function findFirstXlsxPath(assetsDir) {
  if (!fs.existsSync(assetsDir)) {
    throw new Error(`Directorio assets no existe: ${assetsDir}`);
  }
  const entries = fs.readdirSync(assetsDir, { withFileTypes: true });
  const xlsx = entries
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .find((name) => name.toLowerCase().endsWith(".xlsx"));
  if (!xlsx) throw new Error(`No hay ningún archivo .xlsx en ${assetsDir}`);
  return path.join(assetsDir, xlsx);
}

/**
 * @param {string[]} sheetNames
 * @param {string} wanted e.g. "eCF"
 * @returns {string | null}
 */
function findSheetName(sheetNames, wanted) {
  const w = wanted.replace(/\s+/g, "").toLowerCase();
  return sheetNames.find((n) => n.replace(/\s+/g, "").toLowerCase() === w) ?? null;
}

/**
 * @param {import("xlsx").WorkSheet} sheet
 * @returns {Array<Record<string, string>>}
 */
function sheetToCleanRowObjects(sheet) {
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  /** @type {Array<Record<string, string>>} */
  const out = [];
  for (const row of rawRows) {
    if (!row || typeof row !== "object") continue;
    const clean = dropHashEFields(/** @type {Record<string, unknown>} */ (row));
    out.push(clean);
  }
  return out;
}

function normalizeColumnName(s) {
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
 * @param {string} wanted
 */
function getRowValue(row, wanted) {
  const wantedNorm = normalizeColumnName(wanted);
  for (const [key, value] of Object.entries(row)) {
    if (normalizeColumnName(key) === wantedNorm) return String(value ?? "").trim();
  }
  return "";
}

/**
 * Lee el workbook: hoja "eCF" obligatoria, "rFCE" opcional (misma fila = mismo índice).
 * @param {string} filePath
 * @returns {Array<Record<string, string>>}
 */
function loadInvoiceRowsFromExcel(filePath) {
  const wb = XLSX.readFile(filePath);
  const ecfName = findSheetName(wb.SheetNames, "eCF");
  if (!ecfName) {
    throw new Error('No se encontró la hoja "eCF". Agregue una hoja con ese nombre.');
  }
  const rfceName = findSheetName(wb.SheetNames, "rFCE");

  const ecfRows = sheetToCleanRowObjects(wb.Sheets[ecfName]);
  const rfceRows = rfceName ? sheetToCleanRowObjects(wb.Sheets[rfceName]) : [];
  const rfceEncfs = new Set(rfceRows.map((row) => getRowValue(row, "ENCF")).filter(Boolean));

  /** @type {Array<Record<string, string>>} */
  const result = [];
  for (let i = 0; i < ecfRows.length; i++) {
    const row = ecfRows[i];
    if (rowIsEffectivelyEmpty(row)) continue;
    const encf = getRowValue(row, "ENCF");
    // Las filas presentes en RFCE son resúmenes de consumo < 250k; no se envían como e-CF individual.
    if (encf && rfceEncfs.has(encf)) continue;
    result.push(row);
  }
  return result;
}

/** @deprecated Usar loadInvoiceRowsFromExcel; mantiene compatibilidad (solo primera hoja). */
function loadRowsFromExcel(filePath) {
  const wb = XLSX.readFile(filePath);
  const name = wb.SheetNames[0];
  if (!name) throw new Error("La hoja de cálculo no tiene hojas.");
  const rows = sheetToCleanRowObjects(wb.Sheets[name]);
  return rows.filter((r) => !rowIsEffectivelyEmpty(r));
}

/**
 * Loads only the RFCE rows (consumer invoices < 250K that need summary submission).
 * @param {string} filePath
 * @returns {Array<Record<string, string>>}
 */
function loadRfceRowsFromExcel(filePath) {
  const wb = XLSX.readFile(filePath);
  const rfceName = findSheetName(wb.SheetNames, "rFCE");
  if (!rfceName) return [];
  const rows = sheetToCleanRowObjects(wb.Sheets[rfceName]);
  return rows.filter((r) => !rowIsEffectivelyEmpty(r));
}

/**
 * Returns full eCF rows whose eNCF also appears in the RFCE sheet.
 * These are the complete invoice rows needed to sign and derive CodigoSeguridadeCF.
 * @param {string} filePath
 * @returns {Map<string, Record<string, string>>} Map from eNCF → full eCF row
 */
function loadFullEcfRowsForRfce(filePath) {
  const wb = XLSX.readFile(filePath);
  const ecfName = findSheetName(wb.SheetNames, "eCF");
  const rfceName = findSheetName(wb.SheetNames, "rFCE");
  if (!ecfName || !rfceName) return new Map();

  const rfceRows = sheetToCleanRowObjects(wb.Sheets[rfceName]);
  const rfceEncfs = new Set(rfceRows.map((row) => getRowValue(row, "ENCF")).filter(Boolean));

  const ecfRows = sheetToCleanRowObjects(wb.Sheets[ecfName]);
  /** @type {Map<string, Record<string, string>>} */
  const result = new Map();
  for (const row of ecfRows) {
    if (rowIsEffectivelyEmpty(row)) continue;
    const encf = getRowValue(row, "ENCF");
    if (encf && rfceEncfs.has(encf)) {
      result.set(encf, row);
    }
  }
  return result;
}

module.exports = {
  dropHashEFields,
  rowIsEffectivelyEmpty,
  findFirstXlsxPath,
  findSheetName,
  loadInvoiceRowsFromExcel,
  loadRfceRowsFromExcel,
  loadFullEcfRowsForRfce,
  loadRowsFromExcel,
  getRowValue,
};
