#!/usr/bin/env node
/**
 * El CLI de prisma (node_modules/prisma/build/index.js) corre `migrate deploy`
 * en cada arranque del backend empaquetado (ver src/index.ts). Para eso necesita
 * el binario schema-engine-windows.exe en node_modules/@prisma/engines/, que
 * nunca se descarga en una maquina de desarrollo Mac/Linux porque @prisma/engines
 * solo trae el engine nativo del host. Sin ese archivo, el primer arranque en
 * Windows del cliente intenta bajarlo de https://binaries.prisma.sh y falla ahi
 * si no hay red, el firewall/antivirus lo bloquea, o el directorio de instalacion
 * no es escribible -> "las migraciones no arrancan" en Windows.
 *
 * Este script lo descarga en build-time (desde cualquier SO) y lo deja en el
 * mismo lugar donde el CLI lo busca, para que el cliente nunca dependa de esa
 * descarga. Se corre antes de empaquetar para Windows (ver electron/package.json).
 *
 * Uso: node script/fetch-win-schema-engine.js
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const zlib = require("zlib");

const { enginesVersion } = require("@prisma/engines-version");
const { getEnginesPath } = require("@prisma/engines");

const BINARY_NAME = "schema-engine-windows.exe";
const DOWNLOAD_URL = `https://binaries.prisma.sh/all_commits/${enginesVersion}/windows/schema-engine.exe.gz`;

const targetPath = path.join(getEnginesPath(), BINARY_NAME);

const download = (url, redirectsLeft = 5) =>
  new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectsLeft <= 0) return reject(new Error("Demasiadas redirecciones."));
          res.resume();
          return resolve(download(res.headers.location, redirectsLeft - 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} al descargar ${url}`));
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });

const main = async () => {
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
    console.log(`[fetch-win-schema-engine] Ya existe ${targetPath}, nada que hacer.`);
    return;
  }

  console.log(`[fetch-win-schema-engine] Descargando engine ${enginesVersion} desde ${DOWNLOAD_URL} ...`);
  const gzipped = await download(DOWNLOAD_URL);
  const binary = zlib.gunzipSync(gzipped);

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, binary, { mode: 0o755 });

  console.log(`[fetch-win-schema-engine] Listo: ${targetPath} (${(binary.length / 1024 / 1024).toFixed(1)} MB)`);
};

main().catch((error) => {
  console.error("[fetch-win-schema-engine] Fallo la descarga:", error);
  process.exit(1);
});
