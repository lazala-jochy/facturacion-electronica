#!/usr/bin/env node
/**
 * Proceso CLI: Excel en /assets → sin firmar en /assets/xml → firmados en /assets/signed.
 * Raíz DGII `<ECF>`, `<DetallesItems>`, fechas DD-MM-YYYY / DD-MM-YYYY HH:mm:ss, firma xml-crypto
 * (RSA-SHA256, C14N http://www.w3.org/TR/2001/REC-xml-c14n-20010315, enveloped, Reference URI="").
 *
 * Variables de entorno:
 *   CERT_PASSWORD          contraseña del .p12/.pfx en /assets (primer archivo encontrado).
 *   DGII_RNC_EMISOR        RNCEmisor si no viene en Excel.
 *   DGII_TIPOECF           si se define (ej: 32), reemplaza el TipoeCF de cada fila del Excel.
 *   DGII_EMISOR_MUNICIPIO / DGII_EMISOR_PROVINCIA  código si faltan en Excel (fallback).
 *
 * Uso:
 *   cd backend && node script/run.js
 */

const path = require("path");
const { runEcfExcelBatch } = require("../utils/ecfExcelBatchRunner");

const backendRoot = path.resolve(__dirname, "..");
const assetsDir = path.join(backendRoot, "assets");
const outXmlDir = path.join(assetsDir, "xml");
const outSignedDir = path.join(assetsDir, "signed");

async function main() {
  const certPw = process.env.CERT_PASSWORD;
  if (!certPw) {
    console.error("[ecf-batch] ERROR: Defina CERT_PASSWORD para el certificado .p12.");
    process.exit(1);
  }

  const result = await runEcfExcelBatch({
    assetsDir,
    outXmlDir,
    outSignedDir,
    certPassword: certPw,
  });

  for (const line of result.logs) {
    console.log("[ecf-batch]", line);
  }
  process.exit(result.fail > 0 ? 2 : 0);
}

main().catch((e) => {
  console.error("[ecf-batch]", e);
  process.exit(1);
});
