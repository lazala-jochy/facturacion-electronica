/**
 * Utilidades compartidas entre plantillas e-CF (DGII).
 */

/** Namespace oficial e-CF (obligatorio en CerteCF / validación XSD). */
export const DGII_ECF_NS = "http://www.dgii.gov.do/ecf";

const DEFAULT_MUNICIPIO = process.env.DGII_EMISOR_MUNICIPIO_DEFAULT ?? "010101";
const DEFAULT_PROVINCIA = process.env.DGII_EMISOR_PROVINCIA_DEFAULT ?? "010000";
/** Orden XSD de Comprador (alineado a COMPRADOR_FIELDS en utils/xmlBuilder.js). */
export const DEFAULT_COMPRADOR_MUNICIPIO =
  process.env.DGII_COMPRADOR_MUNICIPIO_DEFAULT ?? DEFAULT_MUNICIPIO;
export const DEFAULT_COMPRADOR_PROVINCIA =
  process.env.DGII_COMPRADOR_PROVINCIA_DEFAULT ?? DEFAULT_PROVINCIA;

export const DEFAULT_FECHA_VENC_SEC = process.env.DGII_ENCF_FECHA_VENC_SECUENCIA ?? "31-12-2028";

export const money = (value: number) => value.toFixed(2);
export const qty = (value: number) => value.toFixed(2);
export const unitPrice4 = (value: number) => value.toFixed(4);

/** Fecha emisión (bloque Emisor): DD-MM-YYYY */
export const fechaEmisionDdMmYyyy = (d: Date) => {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const y = d.getFullYear();
  return `${dd}-${mm}-${y}`;
};

/** Fecha límite de pago (IdDoc crédito): DD-MM-YYYY, días desde emisión. */
export const fechaLimitePagoDesdeEmision = (issueDate: Date, days = 35) => {
  const d = new Date(issueDate);
  d.setDate(d.getDate() + days);
  return fechaEmisionDdMmYyyy(d);
};

/** FechaHoraFirma (antes de Signature): DD-MM-YYYY HH:mm:ss */
export const fechaHoraFirmaDgii = () => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const y = d.getFullYear();
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${dd}-${mm}-${y} ${h}:${mi}:${s}`;
};

/**
 * Código de unidad de medida DGII (numérico). Texto libre no es válido en recepción.
 */
export function mapUnidadMedidaDgii(unitRaw: string): string {
  const u = unitRaw.trim();
  if (/^\d{1,3}$/.test(u)) return u;
  const upper = u.toUpperCase().replace(/\s+/g, " ");
  const map: Record<string, string> = {
    UNIDAD: "43",
    UN: "43",
    DOC: "48",
    DOZ: "12",
    SERVICIO: "43",
    "EQUIPO DE OFICINA": "43",
    KILOGRAMO: "23",
    LITRO: "29",
    METRO: "36",
    CAJA: "41",
  };
  const compact = upper.replace(/\s/g, "");
  for (const [k, v] of Object.entries(map)) {
    if (k.replace(/\s/g, "") === compact) return v;
  }
  return "43";
}

export function splitPhones(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[|,/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function indicadorBienServicio(unit: string, description: string): "1" | "2" {
  const blob = `${unit} ${description}`.toLowerCase();
  if (blob.includes("servicio")) return "2";
  return "1";
}

export const EMISOR_DEFAULT_MUNICIPIO = DEFAULT_MUNICIPIO;
export const EMISOR_DEFAULT_PROVINCIA = DEFAULT_PROVINCIA;

const round2 = (value: number) => Number(value.toFixed(2));

/**
 * Código modificación DGII para nota de crédito (e-CF 34):
 * - `2` Corrige texto → MontoTotal debe ser 0.
 * - `3` Corrige montos del NCF modificado (p. ej. reducir total de un e-CF ya enviado).
 */
export function resolveCodigoModificacionNotaCredito(
  total: number,
  explicit?: string | null,
): string {
  const raw = String(explicit ?? "").trim();
  if (["1", "2", "3", "4"].includes(raw)) return raw;
  return round2(total) <= 0.001 ? "2" : "3";
}
