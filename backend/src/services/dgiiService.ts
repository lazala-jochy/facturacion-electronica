import type { DgiiSubmissionResult } from "../types/dgiiEcf";
import { normalizeDgiiEcfUrl } from "../config/dgiiEcf.constants";
import { readGlobalDgiiBearerToken } from "../config/dgiiGlobalToken";
import {
  isInconclusiveDgiiReceptionBody,
  mapDgiiRawBodyToCotizacionEstado,
} from "../utils/dgiiEstadoRecepcion";
import { DgiiEcfError } from "../types/dgiiEcf";

export type { DgiiSubmissionResult } from "../types/dgiiEcf";

const makeMockTrackId = () => `MOCK-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

/** Texto útil cuando `fetch` falla (Node suele poner detalle en `cause` y poco en el mensaje). */
export function describeFetchFailure(err: unknown, endpoint: string): string {
  let host = endpoint;
  try {
    const u = new URL(endpoint);
    host = u.port ? `${u.hostname}:${u.port}` : u.hostname;
  } catch {
    /* URL inválida: mostrar tal cual acotado */
    host = endpoint.length > 120 ? `${endpoint.slice(0, 120)}…` : endpoint;
  }

  const bits: string[] = [];

  const pushCauseChain = (e: unknown, depth: number) => {
    if (depth > 4 || e == null) return;
    if (e instanceof Error) {
      if (e.message.trim()) bits.push(e.message.trim());
      const c = (e as Error & { cause?: unknown }).cause;
      if (c) pushCauseChain(c, depth + 1);
      const code = (e as NodeJS.ErrnoException).code;
      if (code && !bits.some((b) => b.includes(code))) bits.push(`código ${code}`);
    } else if (typeof e === "object" && e !== null && "message" in e) {
      bits.push(String((e as { message: unknown }).message));
    } else {
      bits.push(String(e));
    }
  };

  pushCauseChain(err, 0);

  if (bits.length === 0) bits.push("fallo de red desconocido");

  const detail = [...new Set(bits)].join(" · ");
  return `No se pudo conectar con el servidor DGII (${host}). ${detail}`;
}

const submitMock = async (signedXml: string): Promise<DgiiSubmissionResult> => {
  const accepted = signedXml.length > 0;
  return {
    accepted,
    status: accepted ? "accepted" : "rejected",
    trackId: makeMockTrackId(),
    rawResponse: JSON.stringify({
      mode: "mock",
      accepted,
      message: accepted ? "e-CF recibido por DGII (mock)." : "e-CF rechazado (mock).",
    }),
  };
};

const compactBody = (raw: string, maxLen = 700): string => {
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (!oneLine) return "(cuerpo vacío)";
  return oneLine.length > maxLen ? `${oneLine.slice(0, maxLen)}...` : oneLine;
};

const extractTrackIdFromJson = (node: unknown, depth = 0): string => {
  if (depth > 8 || node == null) return "";
  if (typeof node === "string") return "";
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = extractTrackIdFromJson(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      const normalizedKey = key.toLowerCase().replace(/[_\-\s]/g, "");
      if (
        typeof value === "string" &&
        value.trim() &&
        (normalizedKey === "trackid" ||
          normalizedKey === "track" ||
          normalizedKey === "codigorecepcion" ||
          normalizedKey === "codigoseguimiento")
      ) {
        return value.trim();
      }
      const nested = extractTrackIdFromJson(value, depth + 1);
      if (nested) return nested;
    }
  }
  return "";
};

const extractTrackIdFromBody = (raw: string): string => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const fromJson = extractTrackIdFromJson(parsed);
    if (fromJson) return fromJson;
  } catch {
    // Not JSON; try XML/plain text below.
  }

  const xmlPatterns = [
    /<(?:\w+:)?(?:trackId|track|codigoRecepcion|codigoSeguimiento)>\s*([^<\s]+)\s*<\/(?:\w+:)?(?:trackId|track|codigoRecepcion|codigoSeguimiento)>/i,
    /\b(?:trackId|track|codigoRecepcion|codigoSeguimiento)\s*[:=]\s*["']?([A-Za-z0-9_.:-]+)["']?/i,
  ];
  for (const pattern of xmlPatterns) {
    const match = raw.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
};

const bodyConfirmsAcceptance = (raw: string): boolean => {
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/\b(rechazad[oa]|invalida?|fall[oa]|no\s+aceptad[oa])\b/.test(normalized)) return false;
  return /\b(aceptad[oa]|recibid[oa]|recepcionad[oa]|procesad[oa]|satisfactori[ao]|exitos[ao])\b/.test(normalized);
};

/** Texto legible para heurísticas (valores de mensajes/estado, no claves JSON). */
const dgiiHumanTextForHeuristics = (raw: string): string => {
  const t = raw.trim();
  if (!t.startsWith("{")) return raw;
  try {
    const j = JSON.parse(t) as Record<string, unknown>;
    const parts: string[] = [];
    for (const k of ["estado", "Estado", "mensaje", "Mensaje", "error", "Error"]) {
      const v = j[k];
      if (typeof v === "string" && v.trim()) parts.push(v.trim());
    }
    const msgs = j.mensajes ?? j.Mensajes;
    if (Array.isArray(msgs)) {
      for (const m of msgs) {
        if (m != null && typeof m === "object" && !Array.isArray(m)) {
          const val = (m as Record<string, unknown>).valor;
          if (typeof val === "string" && val.trim()) parts.push(val.trim());
        }
      }
    }
    return parts.length ? parts.join(" ") : "";
  } catch {
    return raw;
  }
};

const looksLikeHtml = (contentType: string, raw: string): boolean => {
  const ct = contentType.toLowerCase();
  const body = raw.trim().slice(0, 300).toLowerCase();
  return ct.includes("text/html") || body.startsWith("<!doctype html") || body.startsWith("<html");
};

const extractEcfFilename = (signedXml: string): string => {
  const rncMatch = signedXml.match(/<RNCEmisor>\s*([^<\s]+)\s*<\/RNCEmisor>/i);
  const encfMatch = signedXml.match(/<eNCF>\s*([^<\s]+)\s*<\/eNCF>/i);
  const rnc = rncMatch?.[1]?.replace(/\D/g, "") ?? "";
  const encf = encfMatch?.[1]?.trim().replace(/[^\w.-]/g, "") ?? "";
  return rnc && encf ? `${rnc}${encf}.xml` : encf ? `${encf}.xml` : "ecf-signed.xml";
};

export const submitEcfToDgii = async (
  signedXml: string,
  opts?: {
    /** Si la empresa definió URL en perfil, tiene prioridad sobre DGII_ECF_ENDPOINT. */
    endpoint?: string | null;
    bearerToken?: string | null;
  },
): Promise<DgiiSubmissionResult> => {
  const endpoint = normalizeDgiiEcfUrl(opts?.endpoint || process.env.DGII_ECF_ENDPOINT);
  const token = (opts?.bearerToken?.trim() || readGlobalDgiiBearerToken() || "") ?? "";

  if (!endpoint) {
    return submitMock(signedXml);
  }

  let response: Response;
  let rawResponse: string;
  let contentType = "";
  try {
    const form = new FormData();
    const blob = new Blob([signedXml], { type: "text/xml" });
    form.append("xml", blob, extractEcfFilename(signedXml));
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json, text/xml, application/xml, */*",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form,
    });
    contentType = response.headers.get("content-type") ?? "";
    rawResponse = await response.text();
  } catch (e) {
    throw new DgiiEcfError(describeFetchFailure(e, endpoint), "NETWORK");
  }

  const trackId =
    response.headers.get("x-track-id") ??
    response.headers.get("track-id") ??
    extractTrackIdFromBody(rawResponse);

  if (!response.ok) {
    throw new DgiiEcfError(
      `Recepción DGII HTTP ${response.status}. ${compactBody(rawResponse)}`,
      "RECEPTION_FAILED",
      response.status,
    );
  }

  if (looksLikeHtml(contentType, rawResponse)) {
    throw new DgiiEcfError(
      `La URL de recepción DGII respondió HTML, no una confirmación de recepción e-CF. Verifica que el endpoint sea el servicio API correcto. Respuesta: ${compactBody(rawResponse)}`,
      "RECEPTION_FAILED",
      response.status,
    );
  }

  const mapped = mapDgiiRawBodyToCotizacionEstado(rawResponse);
  let status: "accepted" | "rejected" | "prepared" | "pending";
  if (mapped === "rejected") {
    status = "rejected";
  } else if (mapped === "accepted") {
    status = "accepted";
  } else if (mapped === "pending") {
    status = "pending";
  } else if (mapped === "prepared") {
    status = "prepared";
  } else if (isInconclusiveDgiiReceptionBody(rawResponse)) {
    /** p. ej. {"trackId":"…","error":null,"mensaje":null} — no es rechazo; falta consulta estado. */
    status = "pending";
  } else {
    const textForHeuristics = dgiiHumanTextForHeuristics(rawResponse);
    const normalized = textForHeuristics
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const suggestsRejection = /\b(rechazad[oa]|invalida?|fall[oa]|no\s+aceptad[oa])\b/.test(
      normalized,
    );
    const suggestsErrorPhrase =
      /\b(error\s+en|error\s+de|error\s+al|hubo\s+un\s+error)\b/.test(normalized);
    if (suggestsRejection || suggestsErrorPhrase) {
      status = "rejected";
    } else if (bodyConfirmsAcceptance(textForHeuristics)) {
      status = "accepted";
    } else if (trackId?.trim()) {
      status = "pending";
    } else {
      status = "rejected";
    }
  }

  const accepted = status === "accepted";

  if (status === "rejected" && !trackId?.trim()) {
    throw new DgiiEcfError(
      `DGII respondió HTTP ${response.status}, pero no confirmó aceptación ni devolvió trackId real. Respuesta: ${compactBody(rawResponse)}`,
      "RECEPTION_FAILED",
      response.status,
    );
  }

  return {
    accepted,
    status,
    trackId: trackId ?? "",
    rawResponse,
    httpStatus: response.status,
    responseContentType: contentType,
  };
};
