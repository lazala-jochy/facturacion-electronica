/**
 * Interpretación liviana del JSON/Texto DGII tras recepción o consulta (`dgii_response` en cotización).
 */

import { isInconclusiveDgiiReceptionBody } from "./dgiiEstadoRecepcion";
import { parseEncfSequence } from "./ecfTipo";

const stripDiacritics = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Texto ASCII lower para patrones estable. */
const normPhrase = (s: string) => stripDiacritics(s).toLowerCase();

function safeJsonParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function collectMensajesValores(root: Record<string, unknown>): string[] {
  const msgs = root.mensajes ?? root.Mensajes;
  if (!Array.isArray(msgs)) return [];
  const out: string[] = [];
  for (const m of msgs) {
    if (m != null && typeof m === "object" && !Array.isArray(m)) {
      const v = (m as Record<string, unknown>).valor;
      if (typeof v === "string" && v.trim()) out.push(v.trim());
    }
  }
  return out;
}

/** Mensaje legible completo (sin truncar) para modales / copiar. */
export function formatDgiiResponseFullMessage(raw: string | null | undefined): string {
  return buildDgiiDisplayText(raw, 0);
}

/** Texto corto para mostrar en listas / toasts (no sustituye el mensaje completo en detalle). */
export function summarizeDgiiResponse(
  raw: string | null | undefined,
  maxLen = 420,
): string {
  return buildDgiiDisplayText(raw, maxLen);
}

function buildDgiiDisplayText(raw: string | null | undefined, maxLen: number): string {
  if (!raw?.trim()) return "";
  if (isInconclusiveDgiiReceptionBody(raw)) {
    return "Comprobante recibido por DGII; consultando estado final por Track ID.";
  }
  const j = safeJsonParse(raw);
  if (j && typeof j === "object" && !Array.isArray(j)) {
    const o = j as Record<string, unknown>;
    const fromArr = collectMensajesValores(o);
    if (fromArr.length) {
      const s = maxLen > 0 ? fromArr.join(" · ") : fromArr.join("\n\n");
      return truncateDisplayText(s, maxLen);
    }
    const bits: string[] = [];
    for (const k of ["estado", "Estado", "error", "mensaje", "detalle", "Detalle"]) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) bits.push(v.trim());
    }
    if (bits.length) {
      const s = maxLen > 0 ? bits.join(" — ") : bits.join("\n");
      return truncateDisplayText(s, maxLen);
    }
  }
  const one = raw.replace(/\s+/g, " ").trim();
  return truncateDisplayText(one, maxLen);
}

function truncateDisplayText(text: string, maxLen: number): string {
  if (maxLen <= 0 || text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

/** e-NCF y correlativo devueltos por DGII en el JSON de recepción (campo `encf`). */
export function extractEncfFromDgiiResponse(
  raw: string | null | undefined,
): { encf: string; tipo: string; seq: number } | null {
  if (!raw?.trim()) return null;
  const j = safeJsonParse(raw);
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const o = j as Record<string, unknown>;
  const encfRaw = o.encf ?? o.Encf ?? o.ENCF;
  if (typeof encfRaw !== "string" || !encfRaw.trim()) return null;
  const encf = encfRaw.trim();
  const parsed = parseEncfSequence(encf);
  if (!parsed) return null;
  return { encf, tipo: parsed.tipo, seq: parsed.seq };
}

function textoSugiereSecuencia(textoNorm: string): boolean {
  const patterns = [
    "numero de secuencia ya ha sido utilizado",
    "numero de secuencia ya ha sido utilizada",
    "este numero de secuencia ya ha sido utilizado",
    "este numero de secuencia ya ha sido utilizada",
    "secuencia ya utilizada",
    "secuencia ha sido utilizada",
    "numeracion ya utilizada",
    "numeracion utilizada",
    "correlativo ya utilizado",
    "ecf ya utilizado",
    "encf ya utilizado",
    "documento electronico ya ha sido utilizado",
    "duplicidad de secuencia",
    "codigo 1209",
    "(1209)",
  ];
  return patterns.some((p) => textoNorm.includes(p));
}

function codigoEs1209(v: unknown): boolean {
  if (v === 1209 || v === "1209") return true;
  const n = typeof v === "string" ? parseInt(v, 10) : typeof v === "number" ? v : NaN;
  return n === 1209;
}

/**
 * `true` solo si el rechazo indica correlativo/secuencia consumida u otro caso donde conviene pasar al siguiente `ecf_ncf_seq`.
 * No usar `secuenciaUtilizada` en solitario (DGII puede marcarla junto con errores de validación del XML).
 */
export function isDgiiSequenceRejection(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  const textoGlobal = normPhrase(raw);

  const j = safeJsonParse(raw);
  if (j && typeof j === "object" && !Array.isArray(j)) {
    const o = j as Record<string, unknown>;
    if (codigoEs1209(o.codigo) || codigoEs1209(o.Codigo)) return true;

    const msgs = o.mensajes ?? o.Mensajes;
    if (Array.isArray(msgs)) {
      for (const m of msgs) {
        if (m == null || typeof m !== "object" || Array.isArray(m)) continue;
        const rec = m as Record<string, unknown>;
        if (codigoEs1209(rec.codigo)) return true;
        const valor = typeof rec.valor === "string" ? rec.valor : "";
        if (valor.trim() && textoSugiereSecuencia(normPhrase(valor))) return true;
      }
    }
  }

  return textoSugiereSecuencia(textoGlobal);
}
