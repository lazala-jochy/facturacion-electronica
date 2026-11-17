import "../types/express-auth.augment";
import type { RequestHandler } from "express";
import fs from "fs";
import path from "path";
import { prisma } from "../prisma";
import { assertCertificateEncryptionSecret, decryptCompanySecret } from "../utils/companyCertificateCrypto";
import {
  companyHasCertificateRecord,
  loadDecryptedPkcs12ForCompany,
} from "../utils/companyCertificateStorage";
import { getUploadsRoot } from "../utils/uploadsRoot";
import {
  createBatchOutputDir,
  isPathInsideCompanyBatchOutput,
  streamDirectoryAsZip,
} from "../utils/batchOutputDir";

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

/** POST /portal-consumo-menor-250/export — 4 e-CF 32 firmados (flujo aislado). */
export const exportPortalConsumoMenor250Handler: RequestHandler = async (req, res, next) => {
  try {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ message: "No autorizado." });
      return;
    }

    const companyRow = await prisma.company.findUnique({
      where: { id: auth.companyId },
      select: {
        id: true,
        rnc: true,
        appSecretsKeyEnc: true,
        certificateSalt: true,
        certificateEncPath: true,
        certificatePasswordEnc: true,
        certificateKeyphraseEnc: true,
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
        decryptCompanySecret(companyRow.certificateKeyphraseEnc, companyRow) ?? "",
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

    const outputRoot = createBatchOutputDir(getUploadsRoot(), auth.companyId, "portal-consumo-menor-250");
    const portalSignedDir = path.join(outputRoot, "para-subir-certecf");
    fs.mkdirSync(portalSignedDir, { recursive: true });

    const result = exportPortalConsumoMenor250Pack({
      assetsDir,
      portalSignedDir,
      signingFromPkcs12Buffer,
      defaultRncEmisor: companyRow.rnc.trim(),
      createZip: false,
    });

    res.status(200).json({
      outputRoot,
      portalSignedDir: result.portalSignedDir,
      excelPath: result.excelPath,
      files: result.files,
      logs: result.logs,
    });
  } catch (e) {
    next(e);
  }
};

/** GET /portal-consumo-menor-250/download-zip?dir=<outputRoot> — descarga el lote generado como ZIP. */
export const downloadPortalConsumoMenor250ZipHandler: RequestHandler = (req, res, next) => {
  try {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ message: "No autorizado." });
      return;
    }

    const dirRaw = typeof req.query.dir === "string" ? req.query.dir.trim() : "";
    if (!dirRaw) {
      res.status(400).json({ message: "Falta dir." });
      return;
    }

    const dir = path.resolve(dirRaw);
    if (!isPathInsideCompanyBatchOutput(getUploadsRoot(), auth.companyId, dir)) {
      res.status(400).json({ message: "Por seguridad, solo se permite descargar un lote generado por tu empresa." });
      return;
    }
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      res.status(404).json({ message: "La carpeta del lote ya no existe." });
      return;
    }

    streamDirectoryAsZip(res, dir, `${path.basename(dir)}.zip`);
  } catch (e) {
    next(e);
  }
};
