/**
 * ZIP opcional sin dependencias npm (usa binario `zip` del sistema).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

/**
 * @param {string} sourceDir directorio con .xml
 * @param {string} zipPath ruta destino .zip
 * @returns {boolean} true si se creó el zip
 */
function createZipFromDirectory(sourceDir, zipPath) {
  const files = fs.readdirSync(sourceDir).filter((f) => f.toLowerCase().endsWith(".xml"));
  if (files.length === 0) return false;

  const check = spawnSync("which", ["zip"], { encoding: "utf8" });
  if (check.status !== 0 || !check.stdout?.trim()) {
    return false;
  }

  const parent = path.dirname(zipPath);
  fs.mkdirSync(parent, { recursive: true });
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  const result = spawnSync("zip", ["-j", zipPath, ...files.map((f) => path.join(sourceDir, f))], {
    cwd: sourceDir,
    encoding: "utf8",
  });
  return result.status === 0 && fs.existsSync(zipPath);
}

module.exports = { createZipFromDirectory };
