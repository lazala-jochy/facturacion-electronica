/**
 * Lotes Excel (.xlsx en carpeta assets) → XML sin firmar y firmados.
 * Consumido por script/run.js y por el endpoint /ecf-excel-batch.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { findFirstXlsxPath, loadInvoiceRowsFromExcel, loadRfceRowsFromExcel, loadFullEcfRowsForRfce } = require("./excelParser");
const { buildFacturaElectronicaXml, buildRfceXml } = require("./xmlBuilder");
const { signFacturaElectronica, signFacturaElectronicaFromBuffer } = require("./xmlSigner");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sanitizeFileBase(enf) {
  return String(enf).replace(/[^\w\d._-]/g, "_");
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

function rowValue(row, wanted) {
  const wantedNorm = normalizeColumnName(wanted);
  for (const [key, value] of Object.entries(row)) {
    if (normalizeColumnName(key) === wantedNorm) return String(value ?? "").trim();
  }
  return "";
}

function fileBaseForDgii(row, enf) {
  const casoPrueba = rowValue(row, "CasoPrueba").replace(/[^\w\d._-]/g, "");
  if (casoPrueba) return casoPrueba;
  const rnc = rowValue(row, "RNCEmisor").replace(/\D/g, "");
  return sanitizeFileBase(`${rnc}${enf}`);
}

function useSystemCert(opts) {
  const b = opts.signingFromPkcs12Buffer;
  return Boolean(b?.p12Buffer && Buffer.isBuffer(b.p12Buffer));
}

/**
 * @typedef {{ row: number; enf: string | null; error: string }} EcfBatchFailure
 */

/**
 * @typedef {{
 *   assetsDir: string;
 *   outXmlDir: string;
 *   outSignedDir: string;
 *   certPassword?: string;
 *   signingFromPkcs12Buffer?: { p12Buffer: Buffer; passphrase: string };
 *   defaultRncEmisor?: string;
 * }} EcfExcelBatchOpts
 */

/**
 * @param {EcfExcelBatchOpts} opts
 */
async function runEcfExcelBatch(opts) {
  const { assetsDir, outXmlDir, outSignedDir, certPassword = "" } = opts;
  /** @type {string[]} */
  const logs = [];

  const bufferSigning = useSystemCert(opts);

  if (!bufferSigning && !String(certPassword).trim()) {
    throw new Error(
      "[ecf-batch] Defina CERT_PASSWORD para firma desde assets/, o bien use signingFromPkcs12Buffer desde el perfil empresa.",
    );
  }

  function appendLog(stage, enf, idx, detail) {
    const tag = enf ? `[${enf}]` : `[fila ${idx + 1}]`;
    logs.push(`${tag} ${stage}: ${detail}`);
  }

  ensureDir(outXmlDir);
  ensureDir(outSignedDir);

  const xlsxPath = findFirstXlsxPath(assetsDir);
  logs.push(`Excel: ${xlsxPath}`);

  const rows = loadInvoiceRowsFromExcel(xlsxPath);
  logs.push(`Filas eCF (+ rFCE si existe), sin vacíos ni #e: ${rows.length}`);

  let ok = 0;
  let fail = 0;
  /** @type {EcfBatchFailure[]} */
  const failures = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    /** @type {string | null} */
    let enfTag = null;
    try {
      const { xml, enf } = buildFacturaElectronicaXml(row, {
        defaultRncEmisor: opts.defaultRncEmisor,
      });
      enfTag = enf;
      const base = fileBaseForDgii(row, enf);
      const xmlPath = path.join(outXmlDir, `${base}.xml`);
      const signedPath = path.join(outSignedDir, `${base}.xml`);

      fs.writeFileSync(xmlPath, xml, "utf8");
      appendLog("UNSIGNED_XML", enf, i, xmlPath);

      const signedXml = bufferSigning
        ? signFacturaElectronicaFromBuffer(
            xml,
            opts.signingFromPkcs12Buffer.p12Buffer,
            opts.signingFromPkcs12Buffer.passphrase,
          )
        : signFacturaElectronica(xml, assetsDir, certPassword);

      fs.writeFileSync(signedPath, signedXml, "utf8");
      appendLog("SIGNED_XML", enf, i, signedPath);

      ok += 1;
    } catch (e) {
      fail += 1;
      const msg = /** @type {Error} */ (e).message;
      failures.push({ row: i + 1, enf: enfTag, error: msg });
      appendLog("ERROR", enfTag, i, msg);
    }
  }

  logs.push(`Finalizado eCF: ${ok} OK, ${fail} con error.`);

  // --- RFCE generation (consumer invoices < 250K) ---
  // Process: sign full e-CF → extract CodigoSeguridadeCF → build RFCE summary → sign RFCE
  const rfceRows = loadRfceRowsFromExcel(xlsxPath);
  const fullEcfRowsForRfce = loadFullEcfRowsForRfce(xlsxPath);
  let rfceOk = 0;
  let rfceFail = 0;
  const rfceOutXmlDir = path.join(path.dirname(outXmlDir), "rfce-xml");
  const rfceOutSignedDir = path.join(path.dirname(outSignedDir), "rfce-firmados");
  /** e-CF 32 íntegros firmados en el mismo paso que el RFCE (misma firma → CodigoSeguridadeCF). */
  const consumoIntegrasSignedDir = path.join(path.dirname(outSignedDir), "consumo-integras-firmados");
  /** @type {EcfBatchFailure[]} */
  const rfceFailures = [];

  if (rfceRows.length > 0) {
    ensureDir(rfceOutXmlDir);
    ensureDir(rfceOutSignedDir);
    ensureDir(consumoIntegrasSignedDir);
    logs.push(`RFCE filas: ${rfceRows.length}`);

    for (let i = 0; i < rfceRows.length; i++) {
      const row = rfceRows[i];
      /** @type {string | null} */
      let enfTag = null;
      try {
        const rfceEnf = rowValue(row, "ENCF") || Object.values(row).find((v) => /^E\d{12,}/i.test(String(v)));
        enfTag = rfceEnf || null;

        // 1. Sign the FULL e-CF to derive CodigoSeguridadeCF
        let codigoSeguridadeCF = "";
        const fullEcfRow = fullEcfRowsForRfce.get(rfceEnf);
        if (fullEcfRow) {
          const { xml: fullEcfXml } = buildFacturaElectronicaXml(fullEcfRow, {
            defaultRncEmisor: opts.defaultRncEmisor,
          });
          const signedFullEcf = bufferSigning
            ? signFacturaElectronicaFromBuffer(
                fullEcfXml,
                opts.signingFromPkcs12Buffer.p12Buffer,
                opts.signingFromPkcs12Buffer.passphrase,
              )
            : signFacturaElectronica(fullEcfXml, assetsDir, certPassword);

          const integrasBase = fileBaseForDgii(fullEcfRow, rfceEnf);
          const integrasPath = path.join(consumoIntegrasSignedDir, `${integrasBase}.xml`);
          fs.writeFileSync(integrasPath, signedFullEcf, "utf8");
          appendLog("CONSUMO_INTEGRA_SIGNED", rfceEnf, i, integrasPath);

          const svMatch = signedFullEcf.match(/<SignatureValue[^>]*>([^<]+)<\/SignatureValue>/);
          if (svMatch) {
            codigoSeguridadeCF = svMatch[1].replace(/\s+/g, "").substring(0, 6);
          }
          appendLog("RFCE_SECURITY_CODE", rfceEnf, i, `CodigoSeguridadeCF=${codigoSeguridadeCF}`);
        } else {
          appendLog("RFCE_WARNING", rfceEnf, i, "No matching full e-CF row found; CodigoSeguridadeCF will be empty");
        }

        // 2. Build RFCE summary XML with the security code
        const { xml, enf } = buildRfceXml(row, {
          defaultRncEmisor: opts.defaultRncEmisor,
          codigoSeguridadeCF,
        });
        enfTag = enf;
        const base = fileBaseForDgii(row, enf);
        const xmlPath = path.join(rfceOutXmlDir, `${base}.xml`);
        const signedPath = path.join(rfceOutSignedDir, `${base}.xml`);

        fs.writeFileSync(xmlPath, xml, "utf8");
        appendLog("RFCE_UNSIGNED", enf, i, xmlPath);

        // 3. Sign the RFCE summary
        const signedXml = bufferSigning
          ? signFacturaElectronicaFromBuffer(
              xml,
              opts.signingFromPkcs12Buffer.p12Buffer,
              opts.signingFromPkcs12Buffer.passphrase,
            )
          : signFacturaElectronica(xml, assetsDir, certPassword);

        fs.writeFileSync(signedPath, signedXml, "utf8");
        appendLog("RFCE_SIGNED", enf, i, signedPath);

        rfceOk += 1;
      } catch (e) {
        rfceFail += 1;
        const msg = /** @type {Error} */ (e).message;
        rfceFailures.push({ row: i + 1, enf: enfTag, error: msg });
        appendLog("RFCE_ERROR", enfTag, i, msg);
      }
    }
    logs.push(`Finalizado RFCE: ${rfceOk} OK, ${rfceFail} con error.`);
  }

  return {
    excelPath: xlsxPath,
    rowCount: rows.length,
    ok,
    fail,
    outXmlDir,
    outSignedDir,
    failures,
    rfce: {
      rowCount: rfceRows.length,
      ok: rfceOk,
      fail: rfceFail,
      outXmlDir: rfceOutXmlDir,
      outSignedDir: rfceOutSignedDir,
      consumoIntegrasSignedDir,
      failures: rfceFailures,
    },
    logs,
  };
}

module.exports = { runEcfExcelBatch };
