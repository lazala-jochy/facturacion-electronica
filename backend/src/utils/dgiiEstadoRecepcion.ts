/**
 * Interpreta JSON de recepción/consulta CerteCF (misma familia que RFCE).
 * `codigo`: 1 = Aceptado, 2 = Rechazado, 4 = Aceptado condicional (tomado como aceptado para secuencia).
 * Texto `estado` con "pendient" o "proceso" (sin código claro) → `pending` (no confundir con Preparado local).
 */
export type DgiiCotizacionEstado = "accepted" | "rejected" | "prepared" | "pending";

function parseCodigo(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseInt(v.trim(), 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeEstadoText(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function mapDgiiJsonEstadoToCotizacionEstado(
  parsed: Record<string, unknown>,
): DgiiCotizacionEstado | null {
  const codigo = parseCodigo(parsed.codigo);

  if (codigo === 2) return "rejected";
  if (codigo === 1 || codigo === 4) return "accepted";

  const e = normalizeEstadoText(parsed.estado);
  if (e.includes("rechaz")) return "rejected";
  if (e.includes("acept")) return "accepted";
  if (e.includes("proceso") || e.includes("pendient")) return "pending";

  return null;
}

/** Acuse de recepción con trackId pero sin codigo/estado/mensajes (hay que consultar estado). */
export function isInconclusiveDgiiReceptionBody(raw: string): boolean {
  const t = raw.trim();
  if (!t.startsWith("{")) return false;
  try {
    const j = JSON.parse(t) as Record<string, unknown>;
    const trackId =
      (typeof j.trackId === "string" && j.trackId.trim()) ||
      (typeof j.TrackId === "string" && j.TrackId.trim()) ||
      "";
    if (!trackId) return false;
    const codigo = j.codigo ?? j.Codigo;
    const estado = j.estado ?? j.Estado;
    const mensajes = j.mensajes ?? j.Mensajes;
    return codigo == null && estado == null && !(Array.isArray(mensajes) && mensajes.length > 0);
  } catch {
    return false;
  }
}

/** Si el cuerpo es JSON DGII con estado/codigo, devuelve el estado de cotización; si no, null. */
export function mapDgiiRawBodyToCotizacionEstado(raw: string): DgiiCotizacionEstado | null {
  const t = raw.trim();
  if (!t.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(t) as Record<string, unknown>;
    return mapDgiiJsonEstadoToCotizacionEstado(parsed);
  } catch {
    return null;
  }
}
