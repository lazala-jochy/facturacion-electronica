#!/usr/bin/env node
/**
 * Prueba export portal consumo &lt; 250k (módulo aislado, 4 e-CF firmados).
 * Uso: cd backend && node script/smoke-certecf-export-e32.js
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const assetsDir = path.join(__dirname, "..", "assets");
const { DGII_NS, buildFacturaElectronicaXml } = require("../utils/portalConsumoMenor250/xmlBuilder.js");
const {
  findFirstXlsxPath,
  loadRfceLinkedE32Menor250FullRows,
  encfIsE32Consumo,
  getRowValue,
} = require("../utils/portalConsumoMenor250/excelRows.js");
const { exportPortalConsumoMenor250Pack } = require("../utils/portalConsumoMenor250/index.js");

function parseMontoFromXml(xml) {
  const m = xml.match(/<MontoTotal[^>]*>\s*([^<]+)\s*</i);
  if (!m) return NaN;
  return Number(String(m[1]).replace(/,/g, "").trim());
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function findP12InAssets() {
  if (!fs.existsSync(assetsDir)) return null;
  return fs.readdirSync(assetsDir).find((n) => /\.p12$/i.test(n) || /\.pfx$/i.test(n)) ?? null;
}

function main() {
  const xlsxPath = findFirstXlsxPath(assetsDir);
  const linked = loadRfceLinkedE32Menor250FullRows(xlsxPath, 4);
  assert(linked.length === 4, `Se esperaban 4 filas e32<250k; hay ${linked.length}`);

  const defaultRnc =
    process.env.DGII_RNC_EMISOR?.trim().replace(/\D/g, "") ||
    getRowValue(linked[0].fullEcfRow, "RNCEmisor").replace(/\D/g, "") ||
    "00000000000";

  for (const { fullEcfRow, encf } of linked) {
    assert(encfIsE32Consumo(encf), `eNCF debe ser E32: ${encf}`);
    const { xml, enf } = buildFacturaElectronicaXml(fullEcfRow, { defaultRncEmisor: defaultRnc });
    assert(enf && encfIsE32Consumo(enf), `eNCF generado E32: ${enf}`);
    assert(new RegExp(`<ECF[^>]*xmlns=["']${DGII_NS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(xml), "xmlns ECF");
    assert(!/<\s*RFCE[\s>]/i.test(xml), "no debe ser RFCE");
    const monto = parseMontoFromXml(xml);
    assert(Number.isFinite(monto) && monto < 250000, `MontoTotal < 250000; obtuvo ${monto}`);
  }

  const certPw = process.env.CERT_PASSWORD;
  const p12Name = findP12InAssets();
  if (!certPw || !p12Name) {
    console.log("[smoke-portal-e32] OK: Excel + 4 XML e-CF 32 sin firmar (estructura XSD básica).");
    console.log("[smoke-portal-e32] Para probar firma: CERT_PASSWORD + .p12 en backend/assets");
    return;
  }

  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), "smoke-portal-"));
  const portalSignedDir = path.join(outRoot, "para-subir-certecf");
  fs.mkdirSync(portalSignedDir, { recursive: true });

  const p12Buffer = fs.readFileSync(path.join(assetsDir, p12Name));
  const result = exportPortalConsumoMenor250Pack({
    assetsDir,
    portalSignedDir,
    signingFromPkcs12Buffer: { p12Buffer, passphrase: certPw },
    defaultRncEmisor: defaultRnc,
    createZip: true,
  });

  assert(result.files.length === 4, "4 archivos e-CF");
  const names = fs.readdirSync(portalSignedDir).filter((f) => f.endsWith(".xml"));
  assert(names.length === 4, `para-subir-certecf debe tener 4 xml; hay ${names.length}`);

  for (const name of names) {
    const xml = fs.readFileSync(path.join(portalSignedDir, name), "utf8");
    assert(/<SignatureValue[^>]*>[^<]+<\/SignatureValue>/i.test(xml), `${name}: firma`);
    assert(!/<\s*RFCE[\s>]/i.test(xml), `${name}: no RFCE`);
    const encfTag = (xml.match(/<eNCF[^>]*>\s*([^<]+)\s*</i) || [])[1]?.trim() ?? "";
    assert(encfIsE32Consumo(encfTag), `${name}: eNCF E32`);
    const monto = parseMontoFromXml(xml);
    assert(Number.isFinite(monto) && monto < 250000, `${name}: MontoTotal < 250000`);
  }

  console.log("[smoke-portal-e32] OK: 4 e-CF 32 firmados en", portalSignedDir);
  if (result.zipPath) console.log("[smoke-portal-e32] ZIP:", result.zipPath);
}

try {
  main();
} catch (e) {
  console.error("[smoke-portal-e32] FAIL:", e.message || e);
  process.exit(1);
}
