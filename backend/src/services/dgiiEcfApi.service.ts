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
import { DGII_ECF_SANDBOX_DEFAULTS } from "../config/dgiiEcf.constants";
import type { DgiiSubmissionResult } from "../types/dgiiEcf";
import { DgiiEcfError } from "../types/dgiiEcf";
import { describeFetchFailure, submitEcfToDgii } from "./dgiiService";
import { dgiiAuthService } from "./dgiiAuth.service";

const makeTrackId = () => `DGII-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

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
}

const rncDigits = (rnc: string) => rnc.replace(/\D/g, "");

export function resolveDgiiAuthUrl(company: Pick<Company, "dgiiAuthUrl">): string {
  return (company.dgiiAuthUrl?.trim() || DGII_ECF_SANDBOX_DEFAULTS.auth).trim();
}

export function resolveDgiiReceptionUrl(
  company: Pick<Company, "dgiiEcfReceiveUrl" | "dgiiReceptionUrl" | "dgiiEcfEndpoint">,
): string {
  return (
    company.dgiiEcfReceiveUrl?.trim() ||
    company.dgiiReceptionUrl?.trim() ||
    company.dgiiEcfEndpoint?.trim() ||
    process.env.DGII_ECF_ENDPOINT?.trim() ||
    ""
  ).trim();
}

export function resolveDgiiConsultUrl(
  company: Pick<Company, "dgiiStatusUrl" | "dgiiTrackUrl" | "dgiiConsultUrl">,
): string {
  return (
    company.dgiiStatusUrl?.trim() ||
    company.dgiiTrackUrl?.trim() ||
    company.dgiiConsultUrl?.trim() ||
    DGII_ECF_SANDBOX_DEFAULTS.consult
  ).trim();
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
    trackId: makeTrackId(),
    rawResponse: JSON.stringify({
      mode: "mock",
      accepted,
      message: accepted ? "e-CF simulado (sin URL de recepción configurada)." : "e-CF rechazado (mock).",
    }),
  };
}

/** Envío multi-tenant: token + recepción, o POST directo sin token (legacy). */
export async function submitSignedEcfWithTenantConfig(
  company: Company,
  signedXml: string,
): Promise<DgiiSubmissionResult> {
  // Nuevo flujo DGII: semilla + validar semilla + bearer token.
  if (company.dgiiSeedUrl?.trim() && company.dgiiValidateSeedUrl?.trim()) {
    appendDgiiLog(`[send] company=${company.id} mode=seed-flow`);
    const token = await dgiiAuthService.getToken(company.id);
    const reception = resolveDgiiReceptionUrl(company);
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

  const reception = resolveDgiiReceptionUrl(company);
  if (!reception) {
    return mockDgiiSubmission(signedXml);
  }

  const usePasswordAuth = tenantHasPasswordAuth(company);

  if (!usePasswordAuth) {
    appendDgiiLog(`[send] company=${company.id} mode=legacy-direct`);
    return submitEcfToDgii(signedXml, {
      endpoint: reception,
      bearerToken: process.env.DGII_ECF_TOKEN?.trim() || null,
    });
  }

  const token = await authenticateDgii(company);
  appendDgiiLog(`[send] company=${company.id} mode=password-auth reception=${reception}`);
  const headers: Record<string, string> = {
    "Content-Type": "application/xml",
    Accept: "application/json, text/xml, */*",
    Authorization: `Bearer ${token}`,
  };

  let response: Response;
  let rawResponse: string;
  try {
    response = await fetch(reception, {
      method: "POST",
      headers,
      body: signedXml,
    });
    rawResponse = await response.text();
  } catch (e) {
    throw new DgiiEcfError(describeFetchFailure(e, reception), "NETWORK");
  }

  const trackId =
    response.headers.get("x-track-id") ??
    response.headers.get("track-id") ??
    response.headers.get("X-Track-Id") ??
    makeTrackId();

  if (!response.ok) {
    const snippet = rawResponse.length > 500 ? `${rawResponse.slice(0, 500)}…` : rawResponse;
    appendDgiiLog(`[send] company=${company.id} failed status=${response.status} body=${snippet}`);
    throw new DgiiEcfError(
      `Recepción DGII HTTP ${response.status}. ${snippet}`,
      "RECEPTION_FAILED",
      response.status,
    );
  }

  return {
    accepted: true,
    status: "accepted",
    trackId,
    rawResponse,
  };
}

export type DgiiConsultResult = {
  httpStatus: number;
  body: string;
};

/** Consulta estado por trackId (GET con query; si falla, intenta POST JSON). */
export async function consultDgiiTrackId(company: Company, trackId: string): Promise<DgiiConsultResult> {
  const tid = trackId.trim();
  if (!tid) {
    throw new DgiiEcfError("trackId vacío.", "CONSULT_FAILED", 400);
  }

  const consultBase = resolveDgiiConsultUrl(company);
  const usePasswordAuth = tenantHasPasswordAuth(company);

  const authHeader = async (): Promise<Record<string, string>> => {
    const h: Record<string, string> = { Accept: "application/json, text/xml, */*" };
    if (usePasswordAuth) {
      h.Authorization = `Bearer ${await authenticateDgii(company)}`;
    } else {
      const envTok = process.env.DGII_ECF_TOKEN?.trim();
      if (envTok) h.Authorization = `Bearer ${envTok}`;
    }
    return h;
  };

  const getUrl = new URL(consultBase);
  getUrl.searchParams.set("trackId", tid);

  let response: Response;
  let body: string;
  try {
    response = await fetch(getUrl.toString(), {
      method: "GET",
      headers: await authHeader(),
    });
    body = await response.text();
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
        body: JSON.stringify({ trackId: tid, TrackId: tid, RNC: rncDigits(company.rnc) }),
      });
      body = await response.text();
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
