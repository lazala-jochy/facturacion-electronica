import "../types/express-auth.augment";
import type { RequestHandler } from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { prisma } from "../prisma";
import { assertCertificateEncryptionSecret } from "../utils/companyCertificateCrypto";
import {
  companyHasCertificateRecord,
  loadDecryptedPkcs12ForCompany,
} from "../utils/companyCertificateStorage";
import { getUploadsRoot } from "../utils/uploadsRoot";

// Módulo aislado — no usa ecfExcelBatchRunner ni xmlBuilder principal.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { exportPortalConsumoMenor250Pack } = require(path.join(
  __dirname,
  "..",
  "..",
  "utils",
  "portalConsumoMenor250",
  "index.js",
)) as {
  exportPortalConsumoMenor250Pack: (opts: {
    assetsDir: string;
    portalSignedDir: string;
    signingFromPkcs12Buffer: { p12Buffer: Buffer; passphrase: string };
    defaultRncEmisor?: string;
    createZip?: boolean;
  }) => {
    outputRoot?: string;
    excelPath: string;
    portalSignedDir: string;
    zipPath: string | null;
    files: { file: string; encf: string; signedPath: string }[];
    logs: string[];
  };
};

function resolveEcfAssetsDir(): string {
  const fromEnv = process.env.ECF_TEST_ASSETS_DIR?.trim();
  if (fromEnv) {
    const abs = path.resolve(fromEnv);
    if (fs.existsSync(abs)) return abs;
    throw new Error(`ECF_TEST_ASSETS_DIR no existe: ${abs}`);
  }
  const cwdAssets = path.join(process.cwd(), "assets");
  if (fs.existsSync(cwdAssets)) return cwdAssets;
  const electronProcess = process as NodeJS.Process & { resourcesPath?: string };
  const resources =
    typeof electronProcess.resourcesPath === "string" ? electronProcess.resourcesPath : "";
  if (resources.length > 0) {
    const bundled = path.join(resources, "ecf-test-assets");
    if (fs.existsSync(bundled)) return bundled;
  }
  throw new Error(
    "No se encontró carpeta de prueba con Excel (.xlsx). Copie los archivos a backend/assets o defina ECF_TEST_ASSETS_DIR.",
  );
}

function pathLooksLikeDesktopOrDeskChild(resolvedPath: string): boolean {
  const parts = resolvedPath.split(path.sep).filter(Boolean).map((p) => p.toLowerCase());
  return parts.includes("desktop") || parts.includes("escritorio") || parts.includes("onedrive");
}

function isAllowedOutputParentDir(resolvedParent: string): boolean {
  if (pathLooksLikeDesktopOrDeskChild(resolvedParent)) return true;
  try {
    const home = path.resolve(os.homedir());
    const target = path.resolve(resolvedParent);
    return target === home || target.startsWith(`${home}${path.sep}`);
  } catch {
    return false;
  }
}

function defaultDesktopDir(): string | null {
  const home = os.homedir();
  for (const name of ["Desktop", "Escritorio", "OneDrive/Desktop", "OneDrive/Escritorio"]) {
    const p = path.join(home, ...name.split("/"));
    try {
      if (fs.statSync(p).isDirectory()) return path.resolve(p);
    } catch {
      //
    }
  }
  return null;
}

/** POST /portal-consumo-menor-250/export — 4 e-CF 32 firmados (flujo aislado). */
export const exportPortalConsumoMenor250Handler: RequestHandler = async (req, res, next) => {
  try {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ message: "No autorizado." });
      return;
    }

    const rawParent =
      typeof req.body?.desktop_parent_dir === "string" ? req.body.desktop_parent_dir.trim() : "";

    let resolvedParent: string | null = null;
    if (rawParent.length > 0) {
      try {
        resolvedParent = path.resolve(rawParent);
      } catch {
        res.status(400).json({ message: "Ruta del escritorio no válida." });
        return;
      }
    } else {
      resolvedParent = defaultDesktopDir();
    }

    if (!resolvedParent) {
      res.status(400).json({
        message:
          "No se pudo detectar el Escritorio. Abra la app de escritorio o envíe desktop_parent_dir.",
      });
      return;
    }

    let statParent: fs.Stats;
    try {
      statParent = fs.statSync(resolvedParent);
    } catch {
      res.status(400).json({ message: "No se puede acceder a la carpeta del escritorio." });
      return;
    }
    if (!statParent.isDirectory()) {
      res.status(400).json({ message: "La ruta del escritorio debe ser una carpeta." });
      return;
    }

    if (!isAllowedOutputParentDir(resolvedParent)) {
      res.status(400).json({
        message: "Por seguridad, solo se permite guardar dentro de tu carpeta de usuario.",
      });
      return;
    }

    const companyRow = await prisma.company.findUnique({
      where: { id: auth.companyId },
      select: {
        id: true,
        rnc: true,
        certificateSalt: true,
        certificateEncPath: true,
        certificatePasswordEnc: true,
        certificateKeyphrase: true,
      },
    });
    if (!companyRow) {
      res.status(404).json({ message: "Empresa no encontrada." });
      return;
    }

    if (!companyHasCertificateRecord(companyRow)) {
      res.status(428).json({
        code: "CERTIFICATE_REQUIRED",
        message: "Configurá el certificado DGII en Perfil de empresa antes de exportar.",
      });
      return;
    }

    let encryptionSecret: string;
    try {
      encryptionSecret = assertCertificateEncryptionSecret(
        typeof companyRow.certificateKeyphrase === "string" ? companyRow.certificateKeyphrase : "",
      );
    } catch (e) {
      res.status(400).json({
        message: e instanceof Error ? e.message : "Clave de cifrado del certificado inválida.",
      });
      return;
    }

    const uploadsRoot = getUploadsRoot();
    let signingFromPkcs12Buffer: { p12Buffer: Buffer; passphrase: string };
    try {
      const pkcs12 = await loadDecryptedPkcs12ForCompany(companyRow, uploadsRoot, encryptionSecret);
      if (!pkcs12) {
        res.status(428).json({
          code: "CERTIFICATE_REQUIRED",
          message: "No hay certificado almacenado para la empresa.",
        });
        return;
      }
      signingFromPkcs12Buffer = { p12Buffer: pkcs12.p12Buffer, passphrase: pkcs12.password };
    } catch (e) {
      res.status(400).json({
        message: e instanceof Error ? e.message : "No se pudo cargar el certificado.",
      });
      return;
    }

    let assetsDir: string;
    try {
      assetsDir = resolveEcfAssetsDir();
    } catch (e) {
      res.status(500).json({ message: e instanceof Error ? e.message : "Error de configuración." });
      return;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const outputRoot = path.join(resolvedParent, `portal-consumo-menor-250-${stamp}`);
    const portalSignedDir = path.join(outputRoot, "para-subir-certecf");
    fs.mkdirSync(portalSignedDir, { recursive: true });

    const result = exportPortalConsumoMenor250Pack({
      assetsDir,
      portalSignedDir,
      signingFromPkcs12Buffer,
      defaultRncEmisor: companyRow.rnc.trim(),
      createZip: true,
    });

    res.status(200).json({
      outputRoot,
      portalSignedDir: result.portalSignedDir,
      zipPath: result.zipPath,
      excelPath: result.excelPath,
      files: result.files,
      logs: result.logs,
    });
  } catch (e) {
    next(e);
  }
};
