/**
 * Export aislado: 4 e-CF 32 firmados para CerteCF «Facturas de consumo &lt; 250Mil».
 * No importa xmlBuilder/xmlSigner/excelParser del lote principal.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { DGII_NS, buildFacturaElectronicaXml } = require("./xmlBuilder");
const { signFacturaElectronica, signFacturaElectronicaFromBuffer } = require("./xmlSigner");
const {
  findFirstXlsxPath,
  loadRfceLinkedE32Menor250FullRows,
  encfIsE32Consumo,
  getRowValue,
} = require("./excelRows");
const { createZipFromDirectory } = require("./zipPack");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function useSystemCert(opts) {
  const b = opts.signingFromPkcs12Buffer;
  return Boolean(b?.p12Buffer && Buffer.isBuffer(b.p12Buffer));
}

function fileBaseForDgii(row, enf) {
  const casoPrueba = getRowValue(row, "CasoPrueba").replace(/[^\w\d._-]/g, "");
  if (casoPrueba) return casoPrueba;
  const rnc = getRowValue(row, "RNCEmisor").replace(/\D/g, "");
  return `${rnc}${enf}`.replace(/[^\w\d._-]/g, "_");
}

/**
 * @param {string} signedXml
 * @param {string} fileLabel
 */
function assertValidPortalConsumoEcfXml(signedXml, fileLabel) {
  if (/<\s*RFCE[\s>]/i.test(signedXml)) {
    throw new Error(`${fileLabel}: es RFCE; el portal pide e-CF completo (<ECF>).`);
  }
  if (!/<\s*ECF[\s>]/i.test(signedXml)) {
    throw new Error(`${fileLabel}: falta raíz <ECF>.`);
  }
  if (!new RegExp(`xmlns=["']${DGII_NS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(signedXml)) {
    throw new Error(`${fileLabel}: falta xmlns="${DGII_NS}" en <ECF>.`);
  }
  const encf = (signedXml.match(/<eNCF[^>]*>\s*([^<]+)\s*</i) || [])[1]?.trim() ?? "";
  if (!encfIsE32Consumo(encf)) {
    throw new Error(`${fileLabel}: eNCF debe ser tipo 32; obtuvo ${encf || "(vacío)"}.`);
  }
  if (!/<SignatureValue[^>]*>\s*[^<\s][^<]*\s*<\/SignatureValue>/i.test(signedXml)) {
    throw new Error(`${fileLabel}: falta firma digital (SignatureValue).`);
  }
  const m = signedXml.match(/<MontoTotal[^>]*>\s*([^<]+)\s*</i);
  const monto = m ? Number(String(m[1]).replace(/,/g, "").trim()) : NaN;
  if (!Number.isFinite(monto) || monto >= 250_000) {
    throw new Error(`${fileLabel}: MontoTotal debe ser &lt; 250.000; obtuvo ${monto}.`);
  }
}

/**
 * @param {{
 *   assetsDir: string;
 *   portalSignedDir: string;
 *   certPassword?: string;
 *   signingFromPkcs12Buffer?: { p12Buffer: Buffer; passphrase: string };
 *   defaultRncEmisor?: string;
 *   createZip?: boolean;
 * }} opts
 */
function exportPortalConsumoMenor250Pack(opts) {
  const { assetsDir, portalSignedDir, certPassword = "", createZip = true } = opts;
  /** @type {string[]} */
  const logs = [];
  logs.push(
    "AVISO: si ya enviaste RFCE aceptados, NO uses esta exportación (firma distinta). Usá consumo-integras-firmados/ del mismo lote.",
  );

  const bufferSigning = useSystemCert(opts);
  if (!bufferSigning && !String(certPassword).trim()) {
    throw new Error(
      "[portal-consumo-250k] Defina CERT_PASSWORD o use signingFromPkcs12Buffer (certificado de Perfil de empresa).",
    );
  }

  ensureDir(portalSignedDir);

  const xlsxPath = findFirstXlsxPath(assetsDir);
  logs.push(`Excel: ${xlsxPath}`);

  const linked = loadRfceLinkedE32Menor250FullRows(xlsxPath, 4);
  if (linked.length < 4) {
    throw new Error(
      `Se necesitan 4 filas en «rFCE» con e-CF 32 y MontoTotal < 250.000 enlazadas en «eCF». Encontradas: ${linked.length}.`,
    );
  }

  /** @type {{ file: string; encf: string; signedPath: string }[]} */
  const files = [];

  for (const { fullEcfRow, encf } of linked) {
    try {
      const { xml, enf } = buildFacturaElectronicaXml(fullEcfRow, {
        defaultRncEmisor: opts.defaultRncEmisor,
      });
      if (!encfIsE32Consumo(enf)) {
        throw new Error(`Se esperaba e-CF 32; eNCF=${enf}`);
      }

      const signedXml = bufferSigning
        ? signFacturaElectronicaFromBuffer(
            xml,
            opts.signingFromPkcs12Buffer.p12Buffer,
            opts.signingFromPkcs12Buffer.passphrase,
          )
        : signFacturaElectronica(xml, assetsDir, certPassword);

      const base = fileBaseForDgii(fullEcfRow, enf);
      const signedPath = path.join(portalSignedDir, `${base}.xml`);
      assertValidPortalConsumoEcfXml(signedXml, enf);
      fs.writeFileSync(signedPath, signedXml, "utf8");
      logs.push(`[${enf}] e-CF 32 firmado → ${signedPath}`);
      files.push({ file: `${base}.xml`, encf: enf, signedPath });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`[portal-consumo-250k] ${encf}: ${msg}`);
    }
  }

  let zipPath = null;
  if (createZip) {
    const zipTarget = path.join(path.dirname(portalSignedDir), "facturas-consumo-menor-250k.zip");
    if (createZipFromDirectory(portalSignedDir, zipTarget)) {
      zipPath = zipTarget;
      logs.push(`ZIP: ${zipPath}`);
    } else {
      logs.push("ZIP: omitido (comando zip no disponible en el sistema).");
    }
  }

  return { excelPath: xlsxPath, files, logs, portalSignedDir, zipPath };
}

module.exports = { exportPortalConsumoMenor250Pack, assertValidPortalConsumoEcfXml };
