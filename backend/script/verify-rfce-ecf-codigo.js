#!/usr/bin/env node
/**
 * Verifica que cada RFCE tenga CodigoSeguridadeCF = primeros 6 chars del SignatureValue del e-CF íntegro.
 * Uso: node script/verify-rfce-ecf-codigo.js <carpeta-lote-ECF-DGII-Pruebas-...>
 */

"use strict";

const fs = require("fs");
const path = require("path");

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}[^>]*>\\s*([^<]+)\\s*</`, "i"));
  return m ? m[1].trim() : "";
}

function signaturePrefix(xml) {
  const m = xml.match(/<SignatureValue[^>]*>([^<]+)<\/SignatureValue>/i);
  return m ? m[1].replace(/\s+/g, "").substring(0, 6) : "";
}

function main() {
  const root = process.argv[2];
  if (!root) {
    console.error("Uso: node script/verify-rfce-ecf-codigo.js <carpeta-lote>");
    process.exit(1);
  }
  const rfceDir = path.join(root, "rfce-firmados");
  const ecfDir = path.join(root, "consumo-integras-firmados");
  if (!fs.existsSync(rfceDir)) {
    console.error("No existe rfce-firmados en", root);
    process.exit(1);
  }
  if (!fs.existsSync(ecfDir)) {
    console.error(
      "No existe consumo-integras-firmados. Volvé a «Generar en el Escritorio» con la versión actual del sistema.",
    );
    process.exit(1);
  }

  const rfceFiles = fs.readdirSync(rfceDir).filter((f) => f.endsWith(".xml"));
  let ok = 0;
  let fail = 0;
  for (const file of rfceFiles) {
    const rfceXml = fs.readFileSync(path.join(rfceDir, file), "utf8");
    const encf = tag(rfceXml, "eNCF");
    const codigo = tag(rfceXml, "CodigoSeguridadeCF");
    const ecfCandidates = fs
      .readdirSync(ecfDir)
      .filter((f) => f.endsWith(".xml"))
      .map((f) => path.join(ecfDir, f));
    const ecfPath = ecfCandidates.find((p) => tag(fs.readFileSync(p, "utf8"), "eNCF") === encf);
    if (!ecfPath) {
      console.log(`FAIL ${encf}: no hay e-CF íntegro en consumo-integras-firmados/`);
      fail += 1;
      continue;
    }
    const ecfXml = fs.readFileSync(ecfPath, "utf8");
    const pref = signaturePrefix(ecfXml);
    if (codigo && pref && codigo === pref) {
      console.log(`OK   ${encf} CodigoSeguridadeCF=${codigo} ↔ SignatureValue…${pref}`);
      ok += 1;
    } else {
      console.log(
        `FAIL ${encf} RFCE CodigoSeguridadeCF="${codigo}" ≠ e-CF SignatureValue prefijo "${pref}" (${path.basename(ecfPath)})`,
      );
      fail += 1;
    }
  }
  console.log(`\n${ok} OK, ${fail} FAIL de ${rfceFiles.length} RFCE`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
