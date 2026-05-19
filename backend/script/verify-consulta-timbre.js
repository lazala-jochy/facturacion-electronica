#!/usr/bin/env node
/**
 * Verifica URL de consulta timbre DGII a partir de un XML firmado.
 * Uso: node script/verify-consulta-timbre.js <ruta.xml> [CERTIFICACION|PRODUCCION]
 */
"use strict";

const fs = require("fs");
const path = require("path");

const { buildConsultaTimbreQrUrl } = require("../dist/utils/ecfConsultaTimbreQr");
const {
  codigoSeguridadParaConsultaTimbre,
  extractXmlTagValue,
  fechaEmisionUrl,
  fechaFirmaParaConsultaTimbre,
} = require("../dist/utils/ecfXmlExtract");

const xmlPath = process.argv[2];
const env = process.argv[3] === "PRODUCCION" ? "PRODUCCION" : "CERTIFICACION";

if (!xmlPath) {
  console.error("Uso: node script/verify-consulta-timbre.js <firmado.xml> [CERTIFICACION|PRODUCCION]");
  process.exit(1);
}

const signedXml = fs.readFileSync(path.resolve(xmlPath), "utf8");
const tipo =
  extractXmlTagValue(signedXml, "TipoeCF") ||
  (extractXmlTagValue(signedXml, "eNCF").match(/^E(\d{2})/i) || [])[1] ||
  "31";

const url = buildConsultaTimbreQrUrl({
  signedXml,
  dgiiEnvironment: env,
  ecfTipo: tipo,
  fechaFirma: new Date(),
});

console.log("e-NCF:", extractXmlTagValue(signedXml, "eNCF"));
console.log("MontoTotal:", extractXmlTagValue(signedXml, "MontoTotal"));
console.log("FechaEmision (XML):", extractXmlTagValue(signedXml, "FechaEmision"));
console.log("FechaEmision (QR):", fechaEmisionUrl(extractXmlTagValue(signedXml, "FechaEmision")));
console.log("FechaHoraFirma (XML):", extractXmlTagValue(signedXml, "FechaHoraFirma"));
console.log("FechaHoraFirma (QR):", fechaFirmaParaConsultaTimbre(signedXml, new Date()));
console.log("CodigoSeguridad:", codigoSeguridadParaConsultaTimbre(signedXml));
console.log("\nURL QR:\n", url);

(async () => {
  try {
    const res = await fetch(url);
    const html = await res.text();
    const msg = html.match(/No fue encontrada|Aceptado|Rechazado/i)?.[0] || "(sin mensaje claro)";
    console.log("\nRespuesta DGII:", msg);
    if (/no fue encontrada/i.test(msg)) {
      console.log(
        "\nSi el e-CF no fue enviado/aceptado en CerteCF, DGII siempre responde «no encontrada».",
      );
    }
  } catch (e) {
    console.error("\nNo se pudo consultar DGII:", e.message);
  }
})();
