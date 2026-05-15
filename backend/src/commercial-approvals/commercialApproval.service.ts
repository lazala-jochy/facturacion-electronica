import type { Company } from "@prisma/client";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import XLSX from "xlsx";
import { prisma } from "../prisma";
import { signXmlWithP12Buffer } from "../services/signer";
import { submitSignedAcecfWithTenantConfig } from "../services/dgiiEcfApi.service";
import { DgiiEcfError } from "../types/dgiiEcf";
import type {
  CommercialApprovalActionBody,
  CommercialApprovalBatchRunBody,
  CommercialApprovalBatchSendBody,
  CommercialApprovalRejectBody,
} from "./commercialApproval.dto";
import {
  buildAcecfXml,
  fechaHoraAprobacionComercialDgii,
  type AcecfEstado,
  type BuildAcecfInput,
} from "./acecfXmlBuilder";
import { loadCompanySigningMaterial } from "./companySigning";

export type CommercialApprovalProcessResult = {
  ok: boolean;
  encf: string;
  filename: string;
  unsignedPath?: string;
  signedPath?: string;
  signedXml?: string;
  dgii?: {
    accepted: boolean;
    /** Paso 3 DGII: OK | ERROR | INCORRECTO */
    validation: string;
    message: string;
    encf?: string;
    rawResponse?: string;
    httpStatus?: number;
  };
  error?: string;
};

function dropHashEFields(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(row)) {
    if (String(key).includes("#e")) continue;
    const v = raw === null || raw === undefined ? "" : String(raw).trim();
    if (v === "" || v === "#e") continue;
    out[String(key).trim()] = v;
  }
  return out;
}

function pickField(row: Record<string, string>, ...names: string[]): string {
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const keys = Object.keys(row);
  for (const name of names) {
    const n = norm(name);
    const hit = keys.find((k) => norm(k) === n);
    if (hit && row[hit]) return row[hit];
  }
  return "";
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

function resolveOutputRoot(desktopParentDir?: string): string {
  const raw = desktopParentDir?.trim();
  const parent = raw ? path.resolve(raw) : defaultDesktopDir();
  if (!parent) {
    throw new Error("No se pudo determinar carpeta de salida. Indicá desktop_parent_dir.");
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const root = path.join(parent, `ACECF-DGII-${stamp}`);
  fs.mkdirSync(path.join(root, "xml"), { recursive: true });
  fs.mkdirSync(path.join(root, "firmados"), { recursive: true });
  return root;
}

function buildInputFromBody(
  body: CommercialApprovalActionBody,
  company: Company,
  estado: AcecfEstado,
  detalleMotivoRechazo?: string,
): BuildAcecfInput {
  const encf = body.encf?.trim();
  if (!encf) throw new Error("eNCF obligatorio.");
  return {
    version: body.version,
    rncEmisor: (body.rnc_emisor ?? company.rnc).trim(),
    encf,
    fechaEmision: body.fecha_emision ?? "",
    montoTotal: body.monto_total != null ? String(body.monto_total) : "0.00",
    rncComprador: body.rnc_comprador?.trim() ?? "",
    estado,
    fechaHoraAprobacionComercial: fechaHoraAprobacionComercialDgii(),
    detalleMotivoRechazo,
  };
}

async function signAndOptionalSend(
  company: Company,
  unsignedXml: string,
  filename: string,
  encf: string,
  opts: {
    sendToDgii: boolean;
    outputRoot?: string;
  },
): Promise<CommercialApprovalProcessResult> {
  const signing = await loadCompanySigningMaterial(company);
  if (!signing) {
    return { ok: false, encf, filename, error: "Certificado DGII no configurado en la empresa." };
  }

  let unsignedPath: string | undefined;
  let signedPath: string | undefined;
  if (opts.outputRoot) {
    unsignedPath = path.join(opts.outputRoot, "xml", filename);
    signedPath = path.join(opts.outputRoot, "firmados", filename);
    fs.writeFileSync(unsignedPath, unsignedXml, "utf8");
  }

  let signedXml: string;
  try {
    signedXml = signXmlWithP12Buffer(unsignedXml, signing.p12Buffer, signing.passphrase, "modern-sha256");
  } catch (e) {
    return {
      ok: false,
      encf,
      filename,
      unsignedPath,
      error: e instanceof Error ? e.message : "Error al firmar ACECF.",
    };
  }

  if (signedPath) fs.writeFileSync(signedPath, signedXml, "utf8");

  if (!opts.sendToDgii) {
    return { ok: true, encf, filename, unsignedPath, signedPath, signedXml };
  }

  try {
    const dgii = await submitSignedAcecfWithTenantConfig(company, signedXml);
    if (!dgii.accepted) {
      return {
        ok: false,
        encf,
        filename,
        unsignedPath,
        signedPath,
        signedXml,
        dgii: {
          accepted: false,
          validation: dgii.validation,
          message: dgii.message,
          encf: dgii.encf,
          rawResponse: dgii.rawResponse,
          httpStatus: dgii.httpStatus,
        },
        error: dgii.message,
      };
    }
    return {
      ok: true,
      encf,
      filename,
      unsignedPath,
      signedPath,
      signedXml,
      dgii: {
        accepted: true,
        validation: dgii.validation,
        message: dgii.message,
        encf: dgii.encf,
        rawResponse: dgii.rawResponse,
        httpStatus: dgii.httpStatus,
      },
    };
  } catch (e) {
    const msg = e instanceof DgiiEcfError ? e.message : e instanceof Error ? e.message : "Error DGII.";
    return {
      ok: false,
      encf,
      filename,
      unsignedPath,
      signedPath,
      signedXml,
      error: msg,
    };
  }
}

export async function processCommercialApprovalAccept(
  companyId: number,
  body: CommercialApprovalActionBody,
): Promise<CommercialApprovalProcessResult> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error("Empresa no encontrada.");

  const input = buildInputFromBody(body, company, "1");
  if (!input.rncComprador) throw new Error("rnc_comprador obligatorio para ACECF.");

  const { xml, encf, filename } = buildAcecfXml(input);
  const outputRoot =
    body.desktop_parent_dir !== undefined ? resolveOutputRoot(body.desktop_parent_dir) : undefined;

  return signAndOptionalSend(company, xml, filename, encf, {
    sendToDgii: body.send_to_dgii !== false,
    outputRoot,
  });
}

export async function processCommercialApprovalReject(
  companyId: number,
  body: CommercialApprovalRejectBody,
): Promise<CommercialApprovalProcessResult> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error("Empresa no encontrada.");

  const motivo = body.detalle_motivo_rechazo?.trim();
  if (!motivo) throw new Error("detalle_motivo_rechazo obligatorio para rechazo.");

  const input = buildInputFromBody(body, company, "2", motivo);
  if (!input.rncComprador) throw new Error("rnc_comprador obligatorio para ACECF.");

  const { xml, encf, filename } = buildAcecfXml(input);
  const outputRoot =
    body.desktop_parent_dir !== undefined ? resolveOutputRoot(body.desktop_parent_dir) : undefined;

  return signAndOptionalSend(company, xml, filename, encf, {
    sendToDgii: body.send_to_dgii !== false,
    outputRoot,
  });
}

function normalizeSheetToken(name: string): string {
  return name.replace(/\s+/g, "").toLowerCase();
}

/** Nombres exactos de hoja en plantillas CerteCF. */
const ACECF_SHEET_EXACT = [
  "acecf",
  "aceecf_generadas",
  "aprobacioncomercial",
  "aprobacionescomerciales",
  "aprobacionesyrechazoscomerciales",
  "aprobacionorechazocomercial",
  "aprobacionesorechazoscomerciales",
  "setaprobaciones",
];

/** Portal DGII suele exportar p. ej. `ACEECF_Generadas` (doble E). */
function isAcecfLikeSheetName(name: string): boolean {
  const compact = name.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (ACECF_SHEET_EXACT.includes(normalizeSheetToken(name))) return true;
  if (compact.includes("acecf") || compact.includes("aceecf")) return true;
  if (compact.includes("aprobacioncomercial") || compact.includes("aprobacionescomerciales")) {
    return true;
  }
  if (compact.includes("aprobacionesyrechazos")) return true;
  return false;
}

function scoreAcecfSheet(sheet: XLSX.WorkSheet): number {
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }) as Record<
    string,
    unknown
  >[];
  if (!rawRows.length) return 0;
  const sample = dropHashEFields(rawRows[0] ?? {});
  let score = 0;
  if (pickField(sample, "eNCF", "ENCF")) score += 4;
  if (pickField(sample, "RNCComprador", "RNC_COMPRADOR")) score += 3;
  if (pickField(sample, "RNCEmisor", "RNC_EMISOR")) score += 2;
  if (pickField(sample, "Estado", "ESTADO")) score += 1;
  if (pickField(sample, "MontoTotal", "MONTO_TOTAL")) score += 1;
  return score;
}

export function findAcecfSheetName(sheetNames: string[], wb?: XLSX.WorkBook): string | null {
  const exact = sheetNames.find((n) => ACECF_SHEET_EXACT.includes(normalizeSheetToken(n)));
  if (exact) return exact;

  const candidates = sheetNames.filter(isAcecfLikeSheetName);
  if (candidates.length === 0) return null;
  if (candidates.length === 1 || !wb) return candidates[0]!;

  let best = candidates[0]!;
  let bestScore = -1;
  for (const name of candidates) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const score = scoreAcecfSheet(sheet);
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  }
  return best;
}

/** Estado del XML ACECF en el Excel: 1 = aprobación, 2 = rechazo comercial. */
function parseAcecfEstadoFromRow(raw: string): AcecfEstado {
  const t = raw.trim().toLowerCase();
  if (t === "2" || t === "rechazo" || t === "rechazado" || t === "rechazada") return "2";
  return "1";
}

function loadAcecfRowsFromWorkbook(wb: XLSX.WorkBook): Array<Record<string, string>> {
  const sheetName = findAcecfSheetName(wb.SheetNames, wb);
  if (!sheetName) {
    throw new Error(
      `No se encontró hoja ACECF en el Excel. Hojas: ${wb.SheetNames.join(", ")}`,
    );
  }
  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }) as Record<
    string,
    unknown
  >[];
  const rows: Array<Record<string, string>> = [];
  for (const row of rawRows) {
    const clean = dropHashEFields(row);
    if (Object.keys(clean).length === 0) continue;
    rows.push(clean);
  }
  return rows;
}

export function loadAcecfRowsFromExcel(excelPath: string): Array<Record<string, string>> {
  if (!fs.existsSync(excelPath)) throw new Error(`Excel no encontrado: ${excelPath}`);
  return loadAcecfRowsFromWorkbook(XLSX.readFile(excelPath));
}

export function loadAcecfRowsFromExcelBuffer(buffer: Buffer): Array<Record<string, string>> {
  if (!buffer.length) throw new Error("El archivo Excel está vacío.");
  return loadAcecfRowsFromWorkbook(XLSX.read(buffer, { type: "buffer" }));
}

function rowToBuildInput(row: Record<string, string>, defaultRncEmisor: string): BuildAcecfInput {
  const encf = pickField(row, "eNCF", "ENCF");
  const estadoRaw = pickField(row, "Estado", "ESTADO") || "1";
  const estado = parseAcecfEstadoFromRow(estadoRaw);
  const rncComprador = pickField(row, "RNCComprador", "RNC_COMPRADOR");
  if (!encf) throw new Error("Fila sin eNCF.");
  if (!rncComprador) throw new Error(`Fila ${encf}: sin RNCComprador.`);

  const detalleMotivo = pickField(row, "DetalleMotivoRechazo", "DETALLE_MOTIVO_RECHAZO");
  if (estado === "2" && !detalleMotivo) {
    throw new Error(`Fila ${encf}: DetalleMotivoRechazo obligatorio para rechazo comercial (Estado 2).`);
  }

  return {
    version: pickField(row, "Version", "VERSION") || "1.0",
    rncEmisor: pickField(row, "RNCEmisor", "RNC_EMISOR") || defaultRncEmisor,
    encf,
    fechaEmision: pickField(row, "FechaEmision", "FECHA_EMISION"),
    montoTotal: pickField(row, "MontoTotal", "MONTO_TOTAL") || "0.00",
    rncComprador,
    estado,
    fechaHoraAprobacionComercial:
      pickField(row, "FechaHoraAprobacionComercial", "FECHA_HORA_APROBACION_COMERCIAL") ||
      fechaHoraAprobacionComercialDgii(),
    detalleMotivoRechazo: detalleMotivo,
  };
}

export async function runCommercialApprovalBatchFromExcel(
  companyId: number,
  body: CommercialApprovalBatchRunBody,
): Promise<{
  outputRoot: string;
  outXmlDir: string;
  outSignedDir: string;
  excelPath: string;
  rowCount: number;
  ok: number;
  fail: number;
  results: CommercialApprovalProcessResult[];
}> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error("Empresa no encontrada.");

  const excelPath = body.excel_path?.trim();
  const excelBuffer = body.excel_buffer;
  let rows: Array<Record<string, string>>;
  let excelLabel: string;
  if (excelBuffer?.length) {
    rows = loadAcecfRowsFromExcelBuffer(excelBuffer);
    excelLabel = body.excel_original_name?.trim() || "(subido)";
  } else if (excelPath) {
    rows = loadAcecfRowsFromExcel(excelPath);
    excelLabel = excelPath;
  } else {
    throw new Error(
      "Indicá excel_path (app de escritorio) o subí el archivo Excel (campo excel).",
    );
  }
  const outputRoot = resolveOutputRoot(body.desktop_parent_dir);
  const outXmlDir = path.join(outputRoot, "xml");
  const outSignedDir = path.join(outputRoot, "firmados");

  const results: CommercialApprovalProcessResult[] = [];
  let ok = 0;
  let fail = 0;

  for (const row of rows) {
    try {
      const input = rowToBuildInput(row, company.rnc.trim());
      const { xml, encf, filename } = buildAcecfXml(input);
      const res = await signAndOptionalSend(company, xml, filename, encf, {
        sendToDgii: false,
        outputRoot,
      });
      results.push(res);
      if (res.ok) ok += 1;
      else fail += 1;
    } catch (e) {
      fail += 1;
      results.push({
        ok: false,
        encf: pickField(row, "eNCF", "ENCF") || "?",
        filename: "",
        error: e instanceof Error ? e.message : "Error en fila ACECF.",
      });
    }
  }

  return {
    outputRoot,
    outXmlDir,
    outSignedDir,
    excelPath: excelLabel,
    rowCount: rows.length,
    ok,
    fail,
    results,
  };
}

export async function sendCommercialApprovalBatchSigned(
  companyId: number,
  body: CommercialApprovalBatchSendBody,
): Promise<{
  sent: number;
  failed: number;
  skipped: number;
  results: Array<{
    file: string;
    encf?: string;
    ok: boolean;
    dgiiValidation?: string;
    dgiiMessage?: string;
    error?: string;
  }>;
}> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error("Empresa no encontrada.");

  const dir = path.resolve(body.out_signed_dir.trim());
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error("Carpeta de firmados no válida.");
  }

  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".xml"));
  const results: Array<{
    file: string;
    encf?: string;
    ok: boolean;
    dgiiValidation?: string;
    dgiiMessage?: string;
    error?: string;
  }> = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const file of files) {
    const full = path.join(dir, file);
    const signedXml = fs.readFileSync(full, "utf8");
    const encf = signedXml.match(/<eNCF>\s*([^<\s]+)\s*<\/eNCF>/i)?.[1]?.trim();
    try {
      const dgii = await submitSignedAcecfWithTenantConfig(company, signedXml);
      if (dgii.accepted) {
        results.push({
          file,
          encf,
          ok: true,
          dgiiValidation: dgii.validation,
          dgiiMessage: dgii.message,
        });
        sent += 1;
      } else {
        failed += 1;
        results.push({
          file,
          encf,
          ok: false,
          dgiiValidation: dgii.validation,
          dgiiMessage: dgii.message,
          error: dgii.message,
        });
      }
    } catch (e) {
      const msg = e instanceof DgiiEcfError ? e.message : e instanceof Error ? e.message : "Error";
      if (msg.toLowerCase().includes("ya fue recibido") || msg.toLowerCase().includes("duplicad")) {
        skipped += 1;
        results.push({ file, encf, ok: true, dgiiValidation: "OK", dgiiMessage: msg });
      } else {
        failed += 1;
        results.push({ file, encf, ok: false, error: msg });
      }
    }
  }

  return { sent, failed, skipped, results };
}
