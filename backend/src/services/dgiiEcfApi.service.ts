/**
 * Cliente multi-tenant DGII e-CF: autenticación, recepción de XML firmado y consulta por trackId.
 *
 * Autenticación: POST JSON a `dgiiAuthUrl` con RNC + credenciales de la empresa. La DGII puede
 * usar otros formatos (p. ej. semilla XML); si el ambiente real difiere, ajustá el cuerpo en
 * `buildAuthRequestBody` o añadí adaptadores por `process.env.DGII_AUTH_BODY_MODE`.
 */
import type { Company } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { DGII_ECF_SANDBOX_DEFAULTS, normalizeDgiiEcfUrl } from "../config/dgiiEcf.constants";
import { readGlobalDgiiBearerToken } from "../config/dgiiGlobalToken";
import type { DgiiCertProfile } from "../types/dgiiCertProfile";
import type { DgiiSubmissionResult } from "../types/dgiiEcf";
import { DgiiEcfError } from "../types/dgiiEcf";
import { describeFetchFailure, submitEcfToDgii } from "./dgiiService";
import { submitRfceToDgii } from "./rfceSubmission.service";
import { submitAcecfToDgii } from "../commercial-approvals/acecfSubmission.service";
import type { AcecfDgiiSendResult } from "../commercial-approvals/acecfDgiiResponse";
import { dgiiAuthService } from "./dgiiAuth.service";
import { paso4SeedUrlFromAuthBase, paso4ValidateSeedUrlFromAuthBase } from "../utils/dgiiPaso4Urls";

const makeMockTrackId = () => `MOCK-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

const CACHE_SKEW_MS = 60_000;
const DEFAULT_TOKEN_TTL_MS = 25 * 60 * 1000;

type TokenCacheEntry = { token: string; expiresAtMs: number };
const tokenCache = new Map<number, TokenCacheEntry>();

const DGII_LOG_DIR = path.join(process.cwd(), "logs");
const DGII_LOG_FILE = path.join(DGII_LOG_DIR, "dgii.log");
function appendDgiiLog(message: string): void {
  try {
    if (!fs.existsSync(DGII_LOG_DIR)) fs.mkdirSync(DGII_LOG_DIR, { recursive: true });
    fs.appendFileSync(DGII_LOG_FILE, `${new Date().toISOString()} ${message}\n`, "utf8");
  } catch {
    // ignore
  }
}

export function clearDgiiTokenCache(companyId: number): void {
  tokenCache.delete(companyId);
  dgiiAuthService.clearPaso4TokenCache(companyId);
}

const rncDigits = (rnc: string) => rnc.replace(/\D/g, "");

function hasPaso4SeedFlow(company: Company): boolean {
  if (company.dgiiPaso4SeedUrl?.trim() && company.dgiiPaso4ValidateSeedUrl?.trim()) return true;
  const auth = company.dgiiPaso4AuthUrl?.trim();
  if (!auth) return false;
  return Boolean(paso4SeedUrlFromAuthBase(auth) && paso4ValidateSeedUrlFromAuthBase(auth));
}

export function resolveDgiiAuthUrl(company: Pick<Company, "dgiiAuthUrl">): string {
  return normalizeDgiiEcfUrl(company.dgiiAuthUrl || DGII_ECF_SANDBOX_DEFAULTS.auth);
}

export function resolveDgiiReceptionUrl(
  company: Pick<
    Company,
    "dgiiEcfReceiveUrl" | "dgiiReceptionUrl" | "dgiiEcfEndpoint" | "dgiiPaso4ReceptionUrl" | "dgiiPaso4EcfReceiveUrl"
  >,
  profile: DgiiCertProfile = "paso2",
): string {
  if (profile === "paso4") {
    return normalizeDgiiEcfUrl(
      company.dgiiPaso4EcfReceiveUrl?.trim() || company.dgiiPaso4ReceptionUrl?.trim() || "",
    );
  }
  return normalizeDgiiEcfUrl(
    company.dgiiEcfReceiveUrl?.trim() ||
      company.dgiiReceptionUrl?.trim() ||
      company.dgiiEcfEndpoint?.trim() ||
      process.env.DGII_ECF_ENDPOINT?.trim() ||
      "",
  );
}

/** Ruta oficial de consulta por track (sensible a mayúsculas en algunos hosts IIS). */
const DGII_CONSULT_ESTADO_PATH = "/api/Consultas/Estado";

export type ResolveDgiiConsultUrlOptions = {
  /** Si es `paso4`, se prioriza `dgii_paso4_consult_url` sobre la consulta del Paso 2. */
  certProfile?: DgiiCertProfile;
};

export function resolveDgiiConsultUrl(
  company: Pick<
    Company,
    "dgiiStatusUrl" | "dgiiTrackUrl" | "dgiiConsultUrl" | "dgiiPaso4ConsultUrl"
  >,
  options?: ResolveDgiiConsultUrlOptions,
): string {
  const preferPaso4 =
    options?.certProfile === "paso4" ||
    (!company.dgiiConsultUrl?.trim() && Boolean(company.dgiiPaso4ConsultUrl?.trim()));

  const candidates = preferPaso4
    ? [
        company.dgiiStatusUrl?.trim(),
        company.dgiiTrackUrl?.trim(),
        company.dgiiPaso4ConsultUrl?.trim(),
        company.dgiiConsultUrl?.trim(),
      ]
    : [
        company.dgiiStatusUrl?.trim(),
        company.dgiiTrackUrl?.trim(),
        company.dgiiConsultUrl?.trim(),
        company.dgiiPaso4ConsultUrl?.trim(),
      ];

  const raw = normalizeDgiiEcfUrl(candidates.find(Boolean) || DGII_ECF_SANDBOX_DEFAULTS.consult);
  let url = raw.replace(/\/+$/, "");
  if (/\/api\/Consultas\/estado$/i.test(url)) {
    return url.replace(/\/api\/Consultas\/estado$/i, DGII_CONSULT_ESTADO_PATH);
  }
  return `${url}${DGII_CONSULT_ESTADO_PATH}`;
}

function tenantHasPasswordAuth(company: Pick<Company, "dgiiUsername" | "dgiiPassword">): boolean {
  return Boolean(company.dgiiUsername?.trim() && company.dgiiPassword && company.dgiiPassword.length > 0);
}

function parseJwtExpMs(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? b64 : b64 + "=".repeat(4 - (b64.length % 4));
    const payload = JSON.parse(Buffer.from(pad, "base64").toString("utf8")) as { exp?: number };
    if (typeof payload.exp === "number") return payload.exp * 1000;
  } catch {
    return null;
  }
  return null;
}

function extractTokenFromJson(node: unknown, depth = 0): string | null {
  if (depth > 10) return null;
  if (typeof node === "string") {
    if (/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(node.trim())) return node.trim();
    return null;
  }
  if (node && typeof node === "object" && !Array.isArray(node)) {
    const o = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(o)) {
      const kl = k.toLowerCase();
      if (
        typeof v === "string" &&
        v.length > 16 &&
        (kl === "token" ||
          kl === "accesstoken" ||
          kl === "access_token" ||
          kl === "jwt" ||
          kl === "valor" ||
          kl === "bearer")
      ) {
        return v.trim();
      }
      const nested = extractTokenFromJson(v, depth + 1);
      if (nested) return nested;
    }
  }
  if (Array.isArray(node)) {
    for (const x of node) {
      const t = extractTokenFromJson(x, depth + 1);
      if (t) return t;
    }
  }
  return null;
}

function extractTokenFromAuthResponse(rawText: string, parsed: unknown): string {
  const fromJson = extractTokenFromJson(parsed);
  if (fromJson) return fromJson;
  const m = rawText.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/);
  if (m) return m[0];
  return "";
}

function compactBodyForMessage(rawText: string, maxLen = 700): string {
  const oneLine = rawText.replace(/\s+/g, " ").trim();
  if (!oneLine) return "(cuerpo vacío)";
  return oneLine.length > maxLen ? `${oneLine.slice(0, maxLen)}…` : oneLine;
}

function extractTokenFromXml(rawText: string): string {
  const patterns = [
    /<(?:\w+:)?(?:token|access_token|accesstoken|jwt|bearer)>\s*([^<\s]+)\s*<\/(?:\w+:)?(?:token|access_token|accesstoken|jwt|bearer)>/i,
    /<(?:\w+:)?(?:valor)>\s*(eyJ[\w-]+\.[\w-]+\.[\w-]+)\s*<\/(?:\w+:)?(?:valor)>/i,
  ];
  for (const p of patterns) {
    const m = rawText.match(p);
    if (m?.[1]) return m[1].trim();
  }
  const jwt = rawText.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/);
  return jwt?.[0]?.trim() ?? "";
}

function extractXmlFaultMessage(rawText: string): string {
  const faultPatterns = [
    /<(?:\w+:)?faultstring>\s*([^<]+)\s*<\/(?:\w+:)?faultstring>/i,
    /<(?:\w+:)?(?:message|mensaje|descripcion|description)>\s*([^<]+)\s*<\/(?:\w+:)?(?:message|mensaje|descripcion|description)>/i,
  ];
  for (const p of faultPatterns) {
    const m = rawText.match(p);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return "";
}

function looksLikeSwaggerHtml(contentType: string, rawText: string): boolean {
  const ct = contentType.toLowerCase();
  if (!ct.includes("text/html")) return false;
  const body = rawText.toLowerCase();
  return (
    body.includes("swagger-ui") ||
    body.includes("autenticación api") ||
    body.includes("fe autenticación api") ||
    body.includes("<!doctype html")
  );
}

/** Cuerpo JSON enviado a Autenticación (ajustable si DGII documenta otro esquema). */
function buildAuthRequestBody(company: Company): string {
  const rnc = rncDigits(company.rnc);
  const usuario = company.dgiiUsername!.trim();
  const clave = company.dgiiPassword!;
  return JSON.stringify({
    RNC: rnc,
    Usuario: usuario,
    Clave: clave,
  });
}

export async function authenticateDgii(company: Company): Promise<string> {
  if (!tenantHasPasswordAuth(company)) {
    throw new DgiiEcfError(
      "Configurá usuario y contraseña DGII en el perfil de empresa para usar autenticación por token.",
      "MISSING_CREDENTIALS",
    );
  }

  const cached = tokenCache.get(company.id);
  if (cached && Date.now() < cached.expiresAtMs - CACHE_SKEW_MS) {
    return cached.token;
  }

  const authUrl = resolveDgiiAuthUrl(company);
  let response: Response;
  let rawText: string;
  let contentType = "";
  try {
    response = await fetch(authUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/xml, */*",
      },
      body: buildAuthRequestBody(company),
    });
    contentType = response.headers.get("content-type") ?? "";
    rawText = await response.text();
  } catch (e) {
    throw new DgiiEcfError(describeFetchFailure(e, authUrl), "NETWORK");
  }

  if (!response.ok) {
    const snippet = compactBodyForMessage(rawText, 500);
    const xmlFault = extractXmlFaultMessage(rawText);
    const wrongUrlHint = looksLikeSwaggerHtml(contentType, rawText)
      ? ` Parece ser una URL de documentación Swagger/UI, no el endpoint real de token. Verificá "dgii_auth_url" en Perfil de empresa (URL actual: ${authUrl}).`
      : "";
    throw new DgiiEcfError(
      `Autenticación DGII rechazada (HTTP ${response.status}).${xmlFault ? ` Motivo: ${xmlFault}.` : ""}${wrongUrlHint} Respuesta real: ${snippet}`,
      "AUTH_FAILED",
      response.status,
    );
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch {
    // DGII también puede responder XML/SOAP (no JSON).
  }

  const tokenFromJson = extractTokenFromAuthResponse(rawText, parsed);
  const tokenFromXml = extractTokenFromXml(rawText);
  const token = tokenFromJson || tokenFromXml;
  if (!token) {
    const xmlFault = extractXmlFaultMessage(rawText);
    const snippet = compactBodyForMessage(rawText);
    const wrongUrlHint = looksLikeSwaggerHtml(contentType, rawText)
      ? ` Parece que "dgii_auth_url" apunta a Swagger/UI y no al endpoint de autenticación. URL actual: ${authUrl}.`
      : "";
    throw new DgiiEcfError(
      `No se pudo obtener token de autenticación DGII.${xmlFault ? ` Motivo XML/SOAP: ${xmlFault}.` : ""}${wrongUrlHint} Content-Type: ${contentType || "desconocido"}. Respuesta real: ${snippet}`,
      "TOKEN_PARSE",
      response.status,
    );
  }

  const expMs = parseJwtExpMs(token) ?? Date.now() + DEFAULT_TOKEN_TTL_MS;
  tokenCache.set(company.id, { token, expiresAtMs: expMs });
  return token;
}

export function mockDgiiSubmission(signedXml: string): DgiiSubmissionResult {
  const accepted = signedXml.length > 0;
  return {
    accepted,
    status: accepted ? "accepted" : "rejected",
    trackId: makeMockTrackId(),
    rawResponse: JSON.stringify({
      mode: "mock",
      accepted,
      message: accepted ? "e-CF simulado (sin URL de recepción configurada)." : "e-CF rechazado (mock).",
    }),
  };
}

export async function submitSignedEcfWithTenantConfig(
  company: Company,
  signedXml: string,
  options?: { certProfile?: DgiiCertProfile },
): Promise<DgiiSubmissionResult> {
  const profile = options?.certProfile ?? "paso2";

  const globalTok = readGlobalDgiiBearerToken();
  if (globalTok) {
    const reception = resolveDgiiReceptionUrl(company, profile);
    if (reception) {
      appendDgiiLog(`[send] company=${company.id} mode=global-env-token profile=${profile}`);
      return submitEcfToDgii(signedXml, {
        endpoint: reception,
        bearerToken: globalTok,
      });
    }
  }

  if (profile === "paso4") {
    if (!hasPaso4SeedFlow(company)) {
      throw new DgiiEcfError(
        "Para envío con URLs Paso 4 configurá dgii_paso4_auth_url o dgii_paso4_seed_url y dgii_paso4_validate_seed_url en Perfil de empresa (o la vista «DGII · Pruebas → Paso 4»).",
        "MISSING_CREDENTIALS",
        400,
      );
    }
    appendDgiiLog(`[send] company=${company.id} mode=seed-flow profile=paso4`);
    const token = await dgiiAuthService.getToken(company.id, { certProfile: "paso4" });
    const reception = resolveDgiiReceptionUrl(company, "paso4");
    if (!reception) {
      throw new DgiiEcfError(
        "Falta URL de recepción e-CF para Paso 4 (dgii_paso4_ecf_receive_url o dgii_paso4_reception_url).",
        "MISSING_CREDENTIALS",
        400,
      );
    }
    return submitEcfToDgii(signedXml, {
      endpoint: reception,
      bearerToken: token,
    });
  }

  // Nuevo flujo DGII: semilla + validar semilla + bearer token (Paso 2 / perfil estándar).
  if (company.dgiiSeedUrl?.trim() && company.dgiiValidateSeedUrl?.trim()) {
    appendDgiiLog(`[send] company=${company.id} mode=seed-flow profile=paso2`);
    const token = await dgiiAuthService.getToken(company.id);
    const reception = resolveDgiiReceptionUrl(company, "paso2");
    if (!reception) {
      throw new DgiiEcfError(
        "Falta URL de recepción DGII (dgii_ecf_receive_url o dgii_reception_url).",
        "MISSING_CREDENTIALS",
        400,
      );
    }
    return submitEcfToDgii(signedXml, {
      endpoint: reception,
      bearerToken: token,
    });
  }

  const reception = resolveDgiiReceptionUrl(company, "paso2");
  if (!reception) {
    return mockDgiiSubmission(signedXml);
  }

  const usePasswordAuth = tenantHasPasswordAuth(company);

  if (!usePasswordAuth) {
    appendDgiiLog(`[send] company=${company.id} mode=legacy-direct`);
    return submitEcfToDgii(signedXml, {
      endpoint: reception,
      bearerToken: readGlobalDgiiBearerToken(),
    });
  }

  const token = await authenticateDgii(company);
  appendDgiiLog(`[send] company=${company.id} mode=password-auth reception=${reception}`);
  return submitEcfToDgii(signedXml, {
    endpoint: reception,
    bearerToken: token,
  });
}

export function resolveDgiiRfceReceptionUrl(company: Company): string {
  const explicit = (company as unknown as Record<string, unknown>)["dgiiRfceReceptionUrl"];
  if (typeof explicit === "string" && explicit.trim()) {
    return normalizeDgiiEcfUrl(explicit.trim());
  }
  return DGII_ECF_SANDBOX_DEFAULTS.consumerSummaryReception;
}

/** Submit signed RFCE XML to the consumer summary reception endpoint.
 *  Uses the dedicated RFCE submission service (separate from regular eCF). */
export async function submitSignedRfceWithTenantConfig(
  company: Company,
  signedXml: string,
): Promise<DgiiSubmissionResult> {
  const baseUrl = resolveDgiiRfceReceptionUrl(company);
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/api/recepcion/ecf`;

  let token: string;
  const rfceGlobal = readGlobalDgiiBearerToken();
  if (rfceGlobal) {
    token = rfceGlobal;
  } else if (company.dgiiSeedUrl?.trim() && company.dgiiValidateSeedUrl?.trim()) {
    token = await dgiiAuthService.getToken(company.id);
  } else if (tenantHasPasswordAuth(company)) {
    token = await authenticateDgii(company);
  } else {
    token = "";
  }

  appendDgiiLog(`[rfce-send] company=${company.id} endpoint=${endpoint}`);
  return submitRfceToDgii(signedXml, {
    endpoint,
    bearerToken: token || null,
  });
}

/** URL de recepción ACECF (aprobación comercial). */
export function resolveDgiiCommercialApprovalUrl(
  company: Pick<Company, "dgiiCommercialApprovalUrl">,
): string {
  return normalizeDgiiEcfUrl(
    company.dgiiCommercialApprovalUrl?.trim() || DGII_ECF_SANDBOX_DEFAULTS.commercialApprovalReception || "",
  );
}

/** Envío ACECF firmado — flujo dedicado, no altera e-CF ni RFCE. */
export async function submitSignedAcecfWithTenantConfig(
  company: Company,
  signedXml: string,
): Promise<AcecfDgiiSendResult> {
  const endpoint = resolveDgiiCommercialApprovalUrl(company);
  if (!endpoint) {
    throw new DgiiEcfError(
      "Falta URL de aprobación comercial (dgii_commercial_approval_url). Configurala en Pruebas DGII → Aprobaciones comerciales.",
      "MISSING_CREDENTIALS",
      400,
    );
  }

  let token: string;
  const acecfGlobal = readGlobalDgiiBearerToken();
  if (acecfGlobal) {
    token = acecfGlobal;
  } else if (company.dgiiSeedUrl?.trim() && company.dgiiValidateSeedUrl?.trim()) {
    token = await dgiiAuthService.getToken(company.id);
  } else if (tenantHasPasswordAuth(company)) {
    token = await authenticateDgii(company);
  } else {
    token = "";
  }

  appendDgiiLog(`[acecf-send] company=${company.id} endpoint=${endpoint}`);
  return submitAcecfToDgii(signedXml, {
    endpoint,
    bearerToken: token || null,
  });
}

export type DgiiConsultResult = {
  httpStatus: number;
  body: string;
};

/** Consulta estado por trackId (GET con query `trackid=`; token Paso 4 si las URLs están solo en simulación). */
export async function consultDgiiTrackId(
  company: Company,
  trackId: string,
  options?: { certProfile?: DgiiCertProfile },
): Promise<DgiiConsultResult> {
  const tid = trackId.trim();
  if (!tid) {
    throw new DgiiEcfError("trackId vacío.", "CONSULT_FAILED", 400);
  }

  const inferredPaso4 =
    !company.dgiiConsultUrl?.trim() && Boolean(company.dgiiPaso4ConsultUrl?.trim());
  const effectiveProfile: DgiiCertProfile =
    options?.certProfile ?? (inferredPaso4 ? "paso4" : "paso2");

  const consultBase = resolveDgiiConsultUrl(company, { certProfile: effectiveProfile });
  const usePasswordAuth = tenantHasPasswordAuth(company);
  if (readGlobalDgiiBearerToken()) {
    appendDgiiLog(`[consult] company=${company.id} auth=global-env-token (prioridad sobre semilla)`);
  }

  const authHeader = async (): Promise<Record<string, string>> => {
    const h: Record<string, string> = { Accept: "application/json, text/xml, */*" };
    const envTok = readGlobalDgiiBearerToken();
    if (envTok) {
      h.Authorization = `Bearer ${envTok}`;
      return h;
    }
    if (effectiveProfile === "paso4" && hasPaso4SeedFlow(company)) {
      const tok = await dgiiAuthService.getToken(company.id, { certProfile: "paso4" });
      if (tok) h.Authorization = `Bearer ${tok}`;
      return h;
    }
    if (company.dgiiSeedUrl?.trim() && company.dgiiValidateSeedUrl?.trim()) {
      h.Authorization = `Bearer ${await dgiiAuthService.getToken(company.id)}`;
    } else if (usePasswordAuth) {
      h.Authorization = `Bearer ${await authenticateDgii(company)}`;
    }
    return h;
  };

  const getUrl = new URL(consultBase);
  getUrl.searchParams.set("trackid", tid);
  appendDgiiLog(
    `[consult] company=${company.id} profile=${effectiveProfile} url=${getUrl.toString()}`,
  );

  let response: Response;
  let body: string;
  try {
    response = await fetch(getUrl.toString(), {
      method: "GET",
      headers: await authHeader(),
    });
    body = await response.text();
    appendDgiiLog(`[consult] company=${company.id} status=${response.status} body=${compactBodyForMessage(body, 300)}`);
  } catch (e) {
    throw new DgiiEcfError(describeFetchFailure(e, consultBase), "NETWORK");
  }

  if (response.status === 405 || response.status === 404) {
    try {
      response = await fetch(consultBase, {
        method: "POST",
        headers: {
          ...(await authHeader()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackid: tid,
          trackId: tid,
          TrackId: tid,
          RNC: rncDigits(company.rnc),
        }),
      });
      body = await response.text();
      appendDgiiLog(`[consult-post] company=${company.id} status=${response.status} body=${compactBodyForMessage(body, 300)}`);
    } catch (e) {
      throw new DgiiEcfError(describeFetchFailure(e, consultBase), "NETWORK");
    }
  }

  if (!response.ok) {
    const snippet = body.length > 500 ? `${body.slice(0, 500)}…` : body;
    throw new DgiiEcfError(
      `Consulta DGII HTTP ${response.status}. ${snippet}`,
      "CONSULT_FAILED",
      response.status,
    );
  }

  return { httpStatus: response.status, body };
}
