/**
 * Servicio dedicado para envío de RFCE (Resumen Factura de Consumo Electrónica)
 * a DGII. Completamente separado del flujo eCF normal.
 *
 * Endpoint DGII RFCE: POST https://fc.dgii.gov.do/{ambiente}/recepcionfc/api/recepcion/ecf
 * Ambientes válidos en fc.dgii.gov.do: testecf (pre-cert/cert), ecf (producción).
 */

import fs from "node:fs";
import path from "node:path";
import type { DgiiSubmissionResult } from "../types/dgiiEcf";
import { DgiiEcfError } from "../types/dgiiEcf";
import { normalizeDgiiEcfUrl } from "../config/dgiiEcf.constants";
import { describeFetchFailure } from "./dgiiService";

const LOG_DIR = path.join(process.cwd(), "logs");
const RFCE_LOG_FILE = path.join(LOG_DIR, "dgii-rfce.log");

function appendRfceLog(message: string): void {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(RFCE_LOG_FILE, `${new Date().toISOString()} ${message}\n`, "utf8");
  } catch {
    // ignore log failures
  }
}

function compactBody(raw: string, maxLen = 700): string {
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (!oneLine) return "(cuerpo vacío)";
  return oneLine.length > maxLen ? `${oneLine.slice(0, maxLen)}…` : oneLine;
}

function extractRfceFilename(signedXml: string): string {
  const rncMatch = signedXml.match(/<RNCEmisor>\s*([^<\s]+)\s*<\/RNCEmisor>/i);
  const encfMatch = signedXml.match(/<eNCF>\s*([^<\s]+)\s*<\/eNCF>/i);
  const rnc = rncMatch?.[1]?.replace(/\D/g, "") ?? "";
  const encf = encfMatch?.[1]?.trim().replace(/[^\w.-]/g, "") ?? "";
  return rnc && encf ? `${rnc}${encf}.xml` : encf ? `${encf}.xml` : "rfce-signed.xml";
}

function detectXmlRootTag(xml: string): string {
  const match = xml.match(/<([A-Za-z][\w.-]*)\b[^>]*>/);
  return match?.[1] ?? "unknown";
}

/**
 * RFCE responses use { codigo, estado, mensajes, encf, secuenciaUtilizada }.
 * codigo: 1 = Aceptado, 2 = Rechazado, 4 = Aceptado Condicional.
 * There is NO trackId in RFCE responses (unlike regular eCF reception).
 */
type RfceResponseFields = {
  codigo: number | null;
  estado: string;
  encf: string;
  secuenciaUtilizada: boolean | null;
  mensajes: Array<{ codigo: string; valor: string }>;
};

function parseRfceResponseBody(raw: string): RfceResponseFields {
  const result: RfceResponseFields = {
    codigo: null,
    estado: "",
    encf: "",
    secuenciaUtilizada: null,
    mensajes: [],
  };

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.codigo === "number") result.codigo = parsed.codigo;
    if (typeof parsed.estado === "string") result.estado = parsed.estado.trim();
    if (typeof parsed.encf === "string") result.encf = parsed.encf.trim();
    if (typeof parsed.secuenciaUtilizada === "boolean") result.secuenciaUtilizada = parsed.secuenciaUtilizada;
    if (Array.isArray(parsed.mensajes)) {
      result.mensajes = parsed.mensajes
        .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null)
        .map((m) => ({
          codigo: String(m.codigo ?? ""),
          valor: String(m.valor ?? ""),
        }));
    }
  } catch {
    // non-JSON — try XML
    const codigoMatch = raw.match(/<codigo>\s*(\d+)\s*<\/codigo>/i);
    if (codigoMatch) result.codigo = Number(codigoMatch[1]);
    const estadoMatch = raw.match(/<estado>\s*([^<]+)\s*<\/estado>/i);
    if (estadoMatch) result.estado = estadoMatch[1].trim();
  }

  return result;
}

function isRfceAccepted(fields: RfceResponseFields): boolean {
  return fields.codigo === 1 || fields.codigo === 4;
}

/**
 * Validates that the XML being submitted is actually an RFCE, not a regular ECF.
 * Throws if root tag is <ECF> instead of <RFCE>.
 */
function assertRfceXml(signedXml: string): void {
  const root = detectXmlRootTag(signedXml);
  if (root === "ECF") {
    throw new DgiiEcfError(
      "El XML enviado tiene raíz <ECF> en lugar de <RFCE>. Se está enviando un eCF normal al endpoint RFCE.",
      "RECEPTION_FAILED",
      400,
    );
  }
}

/**
 * Submit a signed RFCE XML to DGII's consumer summary reception endpoint.
 *
 * This is independent from the regular ECF submission (`submitEcfToDgii`).
 * Logs every detail of the request and response for debugging.
 */
export async function submitRfceToDgii(
  signedXml: string,
  opts: {
    endpoint: string;
    bearerToken: string | null;
  },
): Promise<DgiiSubmissionResult> {
  const endpoint = normalizeDgiiEcfUrl(opts.endpoint);
  const token = opts.bearerToken?.trim() ?? "";

  if (!endpoint) {
    throw new DgiiEcfError(
      "Falta endpoint de recepción RFCE. Configurá dgiiRfceReceptionUrl en Perfil de empresa o revisá la constante por defecto.",
      "MISSING_CREDENTIALS",
      400,
    );
  }

  assertRfceXml(signedXml);

  const filename = extractRfceFilename(signedXml);
  const xmlRootTag = detectXmlRootTag(signedXml);

  appendRfceLog(`[rfce-pre-request] endpoint=${endpoint}`);
  appendRfceLog(`[rfce-pre-request] filename=${filename}`);
  appendRfceLog(`[rfce-pre-request] xml_length=${signedXml.length}`);
  appendRfceLog(`[rfce-pre-request] xml_root_tag=<${xmlRootTag}>`);
  appendRfceLog(`[rfce-pre-request] has_bearer_token=${Boolean(token)}`);
  appendRfceLog(`[rfce-pre-request] content_type=multipart/form-data (field=xml, type=text/xml)`);
  appendRfceLog(`[rfce-pre-request] xml_first_500=${signedXml.slice(0, 500).replace(/\n/g, "\\n")}`);

  const headers: Record<string, string> = {
    Accept: "application/json, text/xml, application/xml, */*",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  appendRfceLog(`[rfce-pre-request] headers=${JSON.stringify(Object.keys(headers))}`);

  const form = new FormData();
  const blob = new Blob([signedXml], { type: "text/xml" });
  form.append("xml", blob, filename);

  let response: Response;
  let rawResponse: string;
  let contentType = "";

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: form,
    });
    contentType = response.headers.get("content-type") ?? "";
    rawResponse = await response.text();
  } catch (e) {
    const errMsg = describeFetchFailure(e, endpoint);
    appendRfceLog(`[rfce-network-error] ${errMsg}`);
    throw new DgiiEcfError(errMsg, "NETWORK");
  }

  appendRfceLog(`[rfce-response] status=${response.status}`);
  appendRfceLog(`[rfce-response] content-type=${contentType}`);
  appendRfceLog(`[rfce-response] body=${compactBody(rawResponse, 1200)}`);

  if (!response.ok) {
    const snippet = compactBody(rawResponse);
    const isHtmlError = contentType.includes("text/html") || rawResponse.trim().startsWith("<html");
    const hint = isHtmlError
      ? " La respuesta es HTML genérica, lo cual puede indicar URL incorrecta o servicio no disponible."
      : "";
    appendRfceLog(`[rfce-error] HTTP ${response.status}${hint}`);
    throw new DgiiEcfError(
      `Recepción DGII RFCE HTTP ${response.status}.${hint} ${snippet}`,
      "RECEPTION_FAILED",
      response.status,
    );
  }

  const looksHtml =
    contentType.includes("text/html") ||
    rawResponse.trim().slice(0, 200).toLowerCase().startsWith("<!doctype html") ||
    rawResponse.trim().slice(0, 200).toLowerCase().startsWith("<html");

  if (looksHtml) {
    appendRfceLog(`[rfce-error] Response is HTML, not API response`);
    throw new DgiiEcfError(
      `La URL de recepción RFCE respondió HTML en lugar de JSON/XML. Verificá que el endpoint sea correcto. Respuesta: ${compactBody(rawResponse)}`,
      "RECEPTION_FAILED",
      response.status,
    );
  }

  const rfceFields = parseRfceResponseBody(rawResponse);
  const accepted = isRfceAccepted(rfceFields);

  appendRfceLog(
    `[rfce-result] codigo=${rfceFields.codigo} estado=${rfceFields.estado} encf=${rfceFields.encf} ` +
    `secuenciaUtilizada=${rfceFields.secuenciaUtilizada} accepted=${accepted}`,
  );

  if (rfceFields.mensajes.length > 0) {
    appendRfceLog(`[rfce-result] mensajes=${JSON.stringify(rfceFields.mensajes)}`);
  }

  if (!accepted) {
    const msgDetail = rfceFields.mensajes.map((m) => m.valor).join("; ") || rfceFields.estado || "";
    appendRfceLog(`[rfce-rejected] ${msgDetail}`);
    throw new DgiiEcfError(
      `DGII RFCE: ${rfceFields.estado || "Rechazado"} (codigo=${rfceFields.codigo}). ${msgDetail || compactBody(rawResponse)}`,
      "RECEPTION_FAILED",
      response.status,
    );
  }

  return {
    accepted,
    status: accepted ? "accepted" : "rejected",
    trackId: rfceFields.encf,
    rawResponse,
    httpStatus: response.status,
    responseContentType: contentType,
  };
}
