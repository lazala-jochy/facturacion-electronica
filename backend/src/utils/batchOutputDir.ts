import fs from "fs";
import path from "path";
import archiver from "archiver";
import type { Response } from "express";

/**
 * Antes (Electron) cada lote de prueba se escribía en el Escritorio del usuario -- el
 * backend corría en la misma máquina. En la imagen web el backend corre en un
 * contenedor, así que el lote se guarda bajo uploads/ y se descarga como ZIP desde el
 * navegador en vez de quedar "puesto" en un Escritorio que el contenedor no tiene.
 */
const BATCH_OUTPUT_DIRNAME = "batch-output";

function companyBatchOutputRoot(uploadsRoot: string, companyId: number): string {
  return path.resolve(path.join(uploadsRoot, BATCH_OUTPUT_DIRNAME, String(companyId)));
}

export function createBatchOutputDir(uploadsRoot: string, companyId: number, prefix: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = path.join(companyBatchOutputRoot(uploadsRoot, companyId), `${prefix}-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Evita que una empresa lea/descargue/envíe la carpeta de lote de otra empresa. */
export function isPathInsideCompanyBatchOutput(
  uploadsRoot: string,
  companyId: number,
  candidate: string,
): boolean {
  try {
    const root = companyBatchOutputRoot(uploadsRoot, companyId);
    const target = path.resolve(candidate);
    return target === root || target.startsWith(`${root}${path.sep}`);
  } catch {
    return false;
  }
}

export function streamDirectoryAsZip(res: Response, dirPath: string, downloadName: string): void {
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err) => {
    if (!res.headersSent) res.status(500);
    res.end(String(err?.message ?? err));
  });
  archive.pipe(res);
  archive.directory(dirPath, false);
  void archive.finalize();
}
