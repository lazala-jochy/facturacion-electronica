/**
 * Lectura Excel aislada para export portal (4 e-CF 32 &lt; 250k). No usa excelParser del lote.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { resolveMontoTotalNumeric } = require("./xmlBuilder");

const MONTO_MAX = 250_000;

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
 */
function rowIsEffectivelyEmpty(cleanRow) {
  return Object.keys(cleanRow).length === 0;
}

/**
 * @param {string[]} sheetNames
 * @param {string} wanted
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

/**
 * @param {string} assetsDir
 */
function findFirstXlsxPath(assetsDir) {
  if (!fs.existsSync(assetsDir)) {
    throw new Error(`Directorio assets no existe: ${assetsDir}`);
  }
  const xlsx = fs
    .readdirSync(assetsDir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .find((name) => name.toLowerCase().endsWith(".xlsx"));
  if (!xlsx) throw new Error(`No hay ningún archivo .xlsx en ${assetsDir}`);
  return path.join(assetsDir, xlsx);
}

/**
 * @param {string} encf
 */
function encfIsE32Consumo(encf) {
  const t = String(encf || "").trim().toUpperCase();
  if (!/^E\d{10,}/.test(t)) return false;
  return t.slice(1, 3) === "32";
}

/**
 * @param {Record<string, string>} row
 */
function rowMontoTotalBelow250k(row) {
  const monto = resolveMontoTotalNumeric(row);
  return Number.isFinite(monto) && monto > 0 && monto < MONTO_MAX;
}

/**
 * Primeras filas de rFCE enlazadas a e-CF 32 con MontoTotal &lt; 250.000.
 * @param {string} filePath
 * @param {number} [maxRows=4]
 * @returns {Array<{ fullEcfRow: Record<string, string>; encf: string }>}
 */
function loadRfceLinkedE32Menor250FullRows(filePath, maxRows = 4) {
  const wb = XLSX.readFile(filePath);
  const ecfName = findSheetName(wb.SheetNames, "eCF");
  const rfceName = findSheetName(wb.SheetNames, "rFCE");
  if (!ecfName || !rfceName) {
    throw new Error('Se requieren hojas "eCF" y "rFCE" en el Excel de pruebas.');
  }

  const ecfRows = sheetToCleanRowObjects(wb.Sheets[ecfName]);
  /** @type {Map<string, Record<string, string>>} */
  const ecfByEncf = new Map();
  for (const row of ecfRows) {
    if (rowIsEffectivelyEmpty(row)) continue;
    const encf = getRowValue(row, "ENCF");
    if (encf) ecfByEncf.set(encf, row);
  }

  const rfceRows = sheetToCleanRowObjects(wb.Sheets[rfceName]);
  /** @type {Array<{ fullEcfRow: Record<string, string>; encf: string }>} */
  const linked = [];

  for (const rfceRow of rfceRows) {
    if (linked.length >= maxRows) break;
    if (rowIsEffectivelyEmpty(rfceRow)) continue;
    const encf = getRowValue(rfceRow, "ENCF");
    if (!encf || !encfIsE32Consumo(encf)) continue;
    const fullEcfRow = ecfByEncf.get(encf);
    if (!fullEcfRow) continue;
    if (!rowMontoTotalBelow250k(fullEcfRow)) continue;
    linked.push({ fullEcfRow, encf });
  }

  return linked;
}

module.exports = {
  MONTO_MAX,
  findFirstXlsxPath,
  getRowValue,
  encfIsE32Consumo,
  loadRfceLinkedE32Menor250FullRows,
};
