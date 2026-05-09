import "../types/express-auth.augment";
import type { RequestHandler } from "express";
import fs from "fs";
import path from "path";
import os from "os";
import { prisma } from "../prisma";
import { consultDgiiTrackId, submitSignedEcfWithTenantConfig } from "../services/dgiiEcfApi.service";
import { DgiiEcfError } from "../types/dgiiEcf";
import { assertCertificateEncryptionSecret } from "../utils/companyCertificateCrypto";
import {
  companyHasCertificateRecord,
  loadDecryptedPkcs12ForCompany,
} from "../utils/companyCertificateStorage";

type EcfBatchRunner = (opts: {
  assetsDir: string;
  outXmlDir: string;
  outSignedDir: string;
  certPassword?: string;
  signingFromPkcs12Buffer?: { p12Buffer: Buffer; passphrase: string };
  defaultRncEmisor?: string;
}) => Promise<{
  excelPath: string;
  rowCount: number;
  ok: number;
  fail: number;
  outXmlDir: string;
  outSignedDir: string;
  failures: { row: number; enf: string | null; error: string }[];
  logs: string[];
}>;

// Runner común (.js fuera de `src/` compilado).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runEcfExcelBatch } = require(path.join(
  __dirname,
  "..",
  "..",
  "utils",
  "ecfExcelBatchRunner.js",
)) as { runEcfExcelBatch: EcfBatchRunner };

function resolveEcfAssetsDir(): string {
  const fromEnv = process.env.ECF_TEST_ASSETS_DIR?.trim();
  if (fromEnv) {
    const abs = path.resolve(fromEnv);
    if (fs.existsSync(abs)) return abs;
    throw new Error(`ECF_TEST_ASSETS_DIR no existe: ${abs}`);
  }

  const cwdAssets = path.join(process.cwd(), "assets");
  if (fs.existsSync(cwdAssets)) return cwdAssets;

  /** En proceso backend bajo Electron, `resourcesPath` apunta a `Resources/`. */
  const electronProcess = process as NodeJS.Process & { resourcesPath?: string };
  const resources =
    typeof electronProcess.resourcesPath === "string"
      ? electronProcess.resourcesPath
      : "";

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

/** Permite escritorio u otra carpeta bajo el home del usuario (p. ej. elegida con el buscador). */
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

type DgiiTestStatus = "accepted" | "rejected" | "pending" | "unknown";

function compactResponse(raw: string, maxLen = 700): string {
  const compact = raw.replace(/\s+/g, " ").trim();
  return compact.length > maxLen ? `${compact.slice(0, maxLen)}...` : compact;
}

function normalizeStatusText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function resolveDgiiTestStatus(raw: string): { testStatus: DgiiTestStatus; testMessage: string } {
  const normalized = normalizeStatusText(raw);
  if (/\b(rechazad[oa]|no\s+aceptad[oa]|firma\s+.*no\s+.*valida|invalido|invalida|error)\b/.test(normalized)) {
    return { testStatus: "rejected", testMessage: compactResponse(raw) };
  }
  if (/\b(aceptad[oa]|comprobante\s+aceptad[oa]|prueba\s+aceptad[oa]|valid[ao]|procesad[oa]\s+correctamente)\b/.test(normalized)) {
    return { testStatus: "accepted", testMessage: compactResponse(raw) };
  }
  if (/\b(pendiente|procesando|en\s+proceso|recibid[oa]|recepcionad[oa])\b/.test(normalized)) {
    return { testStatus: "pending", testMessage: compactResponse(raw) };
  }
  return { testStatus: "unknown", testMessage: compactResponse(raw) || "DGII no devolvió estado interpretable." };
}

type SignedXmlSendEntry = {
  file: string;
  fullPath: string;
  signedXml: string;
  encf: string;
  ncfModificado: string;
};

type DgiiSendManifestEntry = {
  file: string;
  encf: string;
  status: DgiiTestStatus | "already_used";
  trackId?: string;
  message?: string;
  updatedAt: string;
};

type DgiiSendManifest = {
  updatedAt: string;
  entries: Record<string, DgiiSendManifestEntry>;
};

function extractXmlTagValue(xml: string, tagName: string): string {
  const match = xml.match(
    new RegExp(`<(?:\\w+:)?${tagName}\\b[^>]*>\\s*([^<]+?)\\s*</(?:\\w+:)?${tagName}>`, "i"),
  );
  return match?.[1]?.trim() ?? "";
}

function loadSendManifest(outSignedDir: string): DgiiSendManifest {
  const manifestPath = path.join(outSignedDir, "dgii-send-status.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Partial<DgiiSendManifest>;
    if (parsed && typeof parsed === "object" && parsed.entries && typeof parsed.entries === "object") {
      return {
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
        entries: parsed.entries as Record<string, DgiiSendManifestEntry>,
      };
    }
  } catch {
    // No manifest yet or invalid file; start fresh.
  }
  return { updatedAt: new Date().toISOString(), entries: {} };
}

function saveSendManifest(outSignedDir: string, manifest: DgiiSendManifest) {
  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(outSignedDir, "dgii-send-status.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
}

function upsertManifestEntry(
  manifest: DgiiSendManifest,
  entry: SignedXmlSendEntry,
  patch: Omit<DgiiSendManifestEntry, "file" | "encf" | "updatedAt">,
) {
  if (!entry.encf) return;
  manifest.entries[entry.encf] = {
    file: entry.file,
    encf: entry.encf,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

function isSequenceAlreadyUsedMessage(raw: string): boolean {
  const normalized = normalizeStatusText(raw);
  return /numero\s+de\s+secuencia.*ha\s+sido\s+utilizad[oa]|secuencia.*utilizad[oa]/.test(normalized);
}

function orderSignedXmlByReferences(entries: SignedXmlSendEntry[]): SignedXmlSendEntry[] {
  const byEncf = new Map<string, SignedXmlSendEntry>();
  for (const entry of entries) {
    if (entry.encf) byEncf.set(entry.encf, entry);
  }

  const ordered: SignedXmlSendEntry[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (entry: SignedXmlSendEntry) => {
    const key = entry.encf || entry.file;
    if (visited.has(key)) return;
    if (visiting.has(key)) return;
    visiting.add(key);

    const dependency = entry.ncfModificado ? byEncf.get(entry.ncfModificado) : undefined;
    if (dependency) visit(dependency);

    visiting.delete(key);
    visited.add(key);
    ordered.push(entry);
  };

  for (const entry of entries) visit(entry);
  return ordered;
}

/** POST /ecf-excel-batch/run — Excel en assets → XML y firmados en subcarpeta del Escritorio. */
export const runExcelBatchToDesktopHandler: RequestHandler = async (req, res, next) => {
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
          "No se pudo detectar el Escritorio. Abra la app de escritorio o envíe desktop_parent_dir con la ruta completa.",
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
        message:
          "Por seguridad, solo se permite guardar dentro de tu carpeta de usuario (Escritorio, Documentos, etc.).",
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
        message:
          "Subí y guardá el certificado DGII (.p12 o .pfx) en Perfil de empresa junto con su clave de cifrado. El sistema la usará aquí.",
      });
      return;
    }

    let encryptionSecret: string;
    try {
      encryptionSecret = assertCertificateEncryptionSecret(
        typeof companyRow.certificateKeyphrase === "string"
          ? companyRow.certificateKeyphrase
          : "",
      );
    } catch (e) {
      res.status(400).json({
        message:
          e instanceof Error
            ? e.message
            : "Guardá la clave de cifrado del certificado en Perfil de empresa (misma que al subir el .p12).",
      });
      return;
    }

    const uploadsRoot = path.join(process.cwd(), "uploads");

    let signingFromPkcs12Buffer: { p12Buffer: Buffer; passphrase: string };
    try {
      const pkcs12 = await loadDecryptedPkcs12ForCompany(companyRow, uploadsRoot, encryptionSecret);
      if (!pkcs12) {
        res.status(428).json({
          code: "CERTIFICATE_REQUIRED",
          message: "No hay certificado almacenado para la empresa. Configurarlo en Perfil de empresa.",
        });
        return;
      }
      signingFromPkcs12Buffer = {
        p12Buffer: pkcs12.p12Buffer,
        passphrase: pkcs12.password,
      };
    } catch (e) {
      res.status(400).json({
        message:
          e instanceof Error
            ? e.message
            : "No se pudo cargar el certificado. Revisá la clave en Perfil de empresa o volvé a subir el .p12.",
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
    const outputRoot = path.join(resolvedParent, `ECF-DGII-Pruebas-${stamp}`);
    fs.mkdirSync(outputRoot, { recursive: true });

    const outXmlDir = path.join(outputRoot, "xml");
    const outSignedDir = path.join(outputRoot, "firmados");

    const result = await runEcfExcelBatch({
      assetsDir,
      outXmlDir,
      outSignedDir,
      signingFromPkcs12Buffer,
      defaultRncEmisor: companyRow.rnc.trim(),
    });

    /** 207 si hubo parcial; 200 si todo OK o si falló todo (el cuerpo trae ok/fail/logs; 500 confundía al cliente). */
    const status = result.fail > 0 && result.ok > 0 ? 207 : 200;

    res.status(status).json({
      outputRoot,
      excelPath: result.excelPath,
      rowCount: result.rowCount,
      ok: result.ok,
      fail: result.fail,
      outXmlDir: result.outXmlDir,
      outSignedDir: result.outSignedDir,
      failures: result.failures,
      logs: result.logs,
      ...(result.ok === 0 && result.fail > 0
        ? {
            message:
              "Ningún XML se generó correctamente. Revisá el certificado en Perfil de empresa, los datos del Excel y la carpeta de prueba.",
          }
        : {}),
    });
  } catch (e) {
    next(e);
  }
};

/** POST /ecf-excel-batch/send — envía XML firmados de una carpeta a DGII. */
export const sendExcelBatchSignedToDgiiHandler: RequestHandler = async (req, res, next) => {
  try {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ message: "No autorizado." });
      return;
    }

    const outSignedDirRaw =
      typeof req.body?.out_signed_dir === "string" ? req.body.out_signed_dir.trim() : "";
    if (!outSignedDirRaw) {
      res.status(400).json({ message: "Falta out_signed_dir." });
      return;
    }

    let outSignedDir = "";
    try {
      outSignedDir = path.resolve(outSignedDirRaw);
    } catch {
      res.status(400).json({ message: "Ruta de carpeta firmados no válida." });
      return;
    }

    if (!isAllowedOutputParentDir(outSignedDir)) {
      res.status(400).json({
        message: "Por seguridad, solo se permite enviar archivos desde tu carpeta de usuario.",
      });
      return;
    }

    let statDir: fs.Stats;
    try {
      statDir = fs.statSync(outSignedDir);
    } catch {
      res.status(400).json({ message: "No se puede acceder a la carpeta de firmados." });
      return;
    }
    if (!statDir.isDirectory()) {
      res.status(400).json({ message: "out_signed_dir debe ser una carpeta." });
      return;
    }

    const companyRow = await prisma.company.findUnique({
      where: { id: auth.companyId },
    });
    if (!companyRow) {
      res.status(404).json({ message: "Empresa no encontrada." });
      return;
    }

    const xmlFiles = fs
      .readdirSync(outSignedDir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.toLowerCase().endsWith(".xml"))
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b));

    if (xmlFiles.length === 0) {
      res.status(400).json({ message: "No se encontraron archivos .xml firmados en la carpeta indicada." });
      return;
    }

    const xmlEntries: SignedXmlSendEntry[] = [];
    for (const file of xmlFiles) {
      const fullPath = path.join(outSignedDir, file);
      const signedXml = fs.readFileSync(fullPath, "utf8");
      if (!signedXml.trim()) {
        res.status(400).json({ message: `XML vacío: ${file}` });
        return;
      }
      xmlEntries.push({
        file,
        fullPath,
        signedXml,
        encf: extractXmlTagValue(signedXml, "eNCF"),
        ncfModificado: extractXmlTagValue(signedXml, "NCFModificado"),
      });
    }

    const orderedEntries = orderSignedXmlByReferences(xmlEntries);
    const entriesByEncf = new Map(xmlEntries.filter((entry) => entry.encf).map((entry) => [entry.encf, entry]));
    const testStatusByEncf = new Map<string, DgiiTestStatus>();
    const manifest = loadSendManifest(outSignedDir);
    for (const [encf, entry] of Object.entries(manifest.entries)) {
      if (entry.status === "accepted" || entry.status === "already_used") {
        testStatusByEncf.set(encf, "accepted");
      }
    }

    const successes: {
      file: string;
      trackId: string;
      status: string;
      testStatus: DgiiTestStatus;
      testMessage: string;
      httpStatus?: number;
      responseContentType?: string;
      responseSnippet: string;
    }[] = [];
    const failures: { file: string; error: string; code?: string; httpStatus?: number }[] = [];
    const logs: string[] = [];

    for (const entry of orderedEntries) {
      try {
        const previousStatus = entry.encf ? manifest.entries[entry.encf]?.status : undefined;
        if (previousStatus === "accepted" || previousStatus === "already_used") {
          const previous = manifest.entries[entry.encf];
          successes.push({
            file: entry.file,
            trackId: previous.trackId ?? "",
            status: "skipped",
            testStatus: "accepted",
            testMessage:
              previous.message ??
              "Omitido: este eNCF ya fue registrado por DGII en un envío anterior.",
            responseSnippet: "",
          });
          testStatusByEncf.set(entry.encf, "accepted");
          logs.push(`[${entry.file}] OMITIDO: eNCF ${entry.encf} ya registrado (${previousStatus}).`);
          continue;
        }

        if (entry.ncfModificado && entriesByEncf.has(entry.ncfModificado)) {
          const dependencyStatus = testStatusByEncf.get(entry.ncfModificado);
          if (dependencyStatus !== "accepted") {
            const dependencyFile = entriesByEncf.get(entry.ncfModificado)?.file ?? entry.ncfModificado;
            const error =
              `No se envió ${entry.encf || entry.file}: NCFModificado ${entry.ncfModificado} ` +
              `depende de ${dependencyFile}, que aún no está aceptado por DGII.`;
            failures.push({ file: entry.file, error, code: "DGII_DEPENDENCY_NOT_ACCEPTED" });
            logs.push(`[${entry.file}] OMITIDO: ${error}`);
            continue;
          }
        }

        const dgii = await submitSignedEcfWithTenantConfig(companyRow, entry.signedXml);
        let testStatus: DgiiTestStatus = "pending";
        let testMessage = "Recibido por DGII; consulta de estado pendiente.";
        if (dgii.trackId?.trim()) {
          try {
            const consult = await consultDgiiTrackId(companyRow, dgii.trackId);
            const resolved = resolveDgiiTestStatus(consult.body);
            testStatus = resolved.testStatus;
            testMessage = resolved.testMessage;
          } catch (consultErr) {
            testStatus = "unknown";
            testMessage = consultErr instanceof Error ? consultErr.message : "No se pudo consultar el estado DGII.";
          }
        }
        successes.push({
          file: entry.file,
          trackId: dgii.trackId,
          status: dgii.status,
          testStatus,
          testMessage,
          httpStatus: dgii.httpStatus,
          responseContentType: dgii.responseContentType,
          responseSnippet: compactResponse(dgii.rawResponse, 500),
        });
        if (entry.encf) {
          testStatusByEncf.set(entry.encf, testStatus);
          if (testStatus === "accepted" || testStatus === "pending") {
            upsertManifestEntry(manifest, entry, {
              status: testStatus,
              trackId: dgii.trackId,
              message: testMessage,
            });
            saveSendManifest(outSignedDir, manifest);
          }
        }
        logs.push(
          `[${entry.file}] ENVIADO: trackId=${dgii.trackId || "(sin trackId)"} recepción=${dgii.status} prueba=${testStatus}`,
        );
      } catch (e) {
        if (e instanceof DgiiEcfError) {
          if (entry.encf && isSequenceAlreadyUsedMessage(e.message)) {
            const message =
              "DGII indica que este número de secuencia ya fue utilizado; se marca como ya registrado para no reenviarlo.";
            successes.push({
              file: entry.file,
              trackId: "",
              status: "already_used",
              testStatus: "accepted",
              testMessage: message,
              httpStatus: e.httpStatus,
              responseSnippet: e.message,
            });
            testStatusByEncf.set(entry.encf, "accepted");
            upsertManifestEntry(manifest, entry, {
              status: "already_used",
              message,
            });
            saveSendManifest(outSignedDir, manifest);
            logs.push(`[${entry.file}] OMITIDO: ${message}`);
            continue;
          }
          failures.push({
            file: entry.file,
            error: e.message,
            code: e.code,
            httpStatus: e.httpStatus,
          });
          if (entry.encf) {
            testStatusByEncf.set(entry.encf, "rejected");
          }
          logs.push(`[${entry.file}] ERROR ${e.code}${e.httpStatus ? `(${e.httpStatus})` : ""}: ${e.message}`);
        } else {
          const msg = e instanceof Error ? e.message : "Error desconocido.";
          failures.push({ file: entry.file, error: msg });
          if (entry.encf) {
            testStatusByEncf.set(entry.encf, "rejected");
          }
          logs.push(`[${entry.file}] ERROR: ${msg}`);
        }
      }
    }

    const ok = successes.length;
    const fail = failures.length;
    const testAccepted = successes.filter((s) => s.testStatus === "accepted").length;
    const testRejected = successes.filter((s) => s.testStatus === "rejected").length;
    const testPending = successes.filter((s) => s.testStatus === "pending").length;
    const testUnknown = successes.filter((s) => s.testStatus === "unknown").length;
    const status = ok > 0 && fail > 0 ? 207 : fail > 0 ? 502 : 200;

    res.status(status).json({
      outSignedDir,
      total: xmlFiles.length,
      ok,
      fail,
      testSummary: {
        accepted: testAccepted,
        rejected: testRejected,
        pending: testPending,
        unknown: testUnknown,
      },
      successes,
      failures,
      logs,
    });
  } catch (e) {
    next(e);
  }
};
