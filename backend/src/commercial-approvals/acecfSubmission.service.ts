/**
 * Envío ACECF a DGII — servicio dedicado (no usa submitEcfToDgii ni RFCE).
 * Respuesta esperada (Paso 3): OK | Error | Incorrecto.
 */

import fs from "node:fs";
import path from "node:path";
import { DgiiEcfError } from "../types/dgiiEcf";
import { normalizeDgiiEcfUrl } from "../config/dgiiEcf.constants";
import { describeFetchFailure } from "../services/dgiiService";
import { acecfDgiiFilename } from "./acecfXmlBuilder";
import { parseAcecfDgiiValidationResponse, type AcecfDgiiSendResult } from "./acecfDgiiResponse";

const LOG_DIR = path.join(process.cwd(), "logs");
const ACECF_LOG_FILE = path.join(LOG_DIR, "dgii-acecf.log");

function appendAcecfLog(message: string): void {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(ACECF_LOG_FILE, `${new Date().toISOString()} ${message}\n`, "utf8");
  } catch {
    // ignore
  }
}

function compactBody(raw: string, maxLen = 700): string {
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (!oneLine) return "(cuerpo vacío)";
  return oneLine.length > maxLen ? `${oneLine.slice(0, maxLen)}…` : oneLine;
}

function detectXmlRootTag(xml: string): string {
  const match = xml.match(/<([A-Za-z][\w.-]*)\b[^>]*>/);
  return match?.[1] ?? "unknown";
}

function extractAcecfFilename(signedXml: string): string {
  const rncComprador = signedXml.match(/<RNCComprador>\s*([^<\s]+)\s*<\/RNCComprador>/i)?.[1] ?? "";
  const encf = signedXml.match(/<eNCF>\s*([^<\s]+)\s*<\/eNCF>/i)?.[1]?.trim() ?? "";
  return acecfDgiiFilename(rncComprador, encf);
}

function assertAcecfXml(signedXml: string): void {
  const root = detectXmlRootTag(signedXml);
  if (root === "ECF" || root === "RFCE") {
    throw new DgiiEcfError(
      `El XML tiene raíz <${root}>; se esperaba <ACECF> para aprobación comercial.`,
      "RECEPTION_FAILED",
      400,
    );
  }
  if (root !== "ACECF") {
    throw new DgiiEcfError(
      `Raíz XML inesperada <${root}>; se esperaba <ACECF>.`,
      "RECEPTION_FAILED",
      400,
    );
  }
}

export async function submitAcecfToDgii(
  signedXml: string,
  opts: {
    endpoint: string;
    bearerToken: string | null;
  },
): Promise<AcecfDgiiSendResult> {
  const endpoint = normalizeDgiiEcfUrl(opts.endpoint);
  const token = opts.bearerToken?.trim() ?? "";

  if (!endpoint) {
    throw new DgiiEcfError(
      "Falta URL de recepción de aprobación comercial (dgii_commercial_approval_url).",
      "MISSING_CREDENTIALS",
      400,
    );
  }

  assertAcecfXml(signedXml);

  const filename = extractAcecfFilename(signedXml);
  const encfFromXml = signedXml.match(/<eNCF>\s*([^<\s]+)\s*<\/eNCF>/i)?.[1]?.trim() ?? "";

  appendAcecfLog(`[acecf-pre-request] endpoint=${endpoint} filename=${filename} len=${signedXml.length}`);

  const headers: Record<string, string> = {
    Accept: "application/json, text/xml, application/xml, */*",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const form = new FormData();
  const blob = new Blob([signedXml], { type: "text/xml" });
  form.append("xml", blob, filename);

  let response: Response;
  let rawResponse: string;
  let contentType = "";

  try {
    response = await fetch(endpoint, { method: "POST", headers, body: form });
    contentType = response.headers.get("content-type") ?? "";
    rawResponse = await response.text();
  } catch (e) {
    const errMsg = describeFetchFailure(e, endpoint);
    appendAcecfLog(`[acecf-network-error] ${errMsg}`);
    throw new DgiiEcfError(errMsg, "NETWORK");
  }

  appendAcecfLog(
    `[acecf-response] status=${response.status} ct=${contentType} body=${compactBody(rawResponse, 1200)}`,
  );

  if (!response.ok) {
    throw new DgiiEcfError(
      `Recepción DGII ACECF HTTP ${response.status}. ${compactBody(rawResponse)}`,
      "RECEPTION_FAILED",
      response.status,
    );
  }

  const looksHtml =
    contentType.includes("text/html") ||
    rawResponse.trim().slice(0, 200).toLowerCase().startsWith("<!doctype html") ||
    rawResponse.trim().slice(0, 200).toLowerCase().startsWith("<html");

  if (looksHtml) {
    throw new DgiiEcfError(
      "La URL de aprobación comercial respondió HTML. Verificá dgii_commercial_approval_url.",
      "RECEPTION_FAILED",
      response.status,
    );
  }

  const parsed = parseAcecfDgiiValidationResponse(rawResponse, response.status, contentType);
  if (!parsed.encf && encfFromXml) parsed.encf = encfFromXml;

  appendAcecfLog(
    `[acecf-validation] encf=${parsed.encf} validation=${parsed.validation} accepted=${parsed.accepted}`,
  );

  return parsed;
}
