/** Códigos de tipo e-CF (NCF electrónico), alineados a la nomenclatura DGII. */

import { ECF_NCF_SEQ_MAX } from "../config/dgiiEcf.constants";

export const ECF_TIPO_LABELS: Record<string, string> = {
  "31": "Factura de Crédito Fiscal",
  "32": "Factura de Consumo",
  "33": "Nota de Débito",
  "34": "Nota de Crédito",
  "41": "Comprobante de Compras",
  "43": "Gastos Menores",
  "44": "Regímenes Especiales de tributación",
  "45": "Gubernamental",
  "46": "Exportaciones",
  "47": "Pagos al exterior",
};

const ALLOWED = new Set(Object.keys(ECF_TIPO_LABELS));

export const DEFAULT_ECF_TIPO = "31";

export const normalizeEcfTipo = (raw: unknown): string => {
  const digits = String(raw ?? DEFAULT_ECF_TIPO).replace(/\D/g, "");
  const two =
    digits.length >= 2
      ? digits.slice(0, 2)
      : digits.length === 1
        ? `0${digits}`
        : DEFAULT_ECF_TIPO;
  if (ALLOWED.has(two)) return two;
  return DEFAULT_ECF_TIPO;
};

/** Parsea e-NCF DGII `E{tipo}{secuencia10}` → tipo y correlativo numérico. */
export const parseEncfSequence = (
  encf: string,
): { tipo: string; seq: number } | null => {
  const clean = encf.trim().toUpperCase().replace(/\s/g, "");
  const m = clean.match(/^E(\d{2})(\d{10})$/);
  if (!m) return null;
  const seq = parseInt(m[2], 10);
  if (!Number.isFinite(seq) || seq < 1) return null;
  return { tipo: normalizeEcfTipo(m[1]), seq };
};

export const buildEcfNumber = (ecfTipo: string, ncfSeq: number): string => {
  const tipo = normalizeEcfTipo(ecfTipo);
  const n = Number.isFinite(ncfSeq) && ncfSeq > 0 ? Math.floor(ncfSeq) : 1;
  const bounded = Math.min(n, ECF_NCF_SEQ_MAX);
  /** Secuencia con 10 dígitos: e-NCF total 13 caracteres (E + tipo 2 + secuencia 10), tipo `eNCFValidation` DGII. */
  return `E${tipo}${String(bounded).padStart(10, "0")}`;
};

/** @deprecated Usar buildEcfNumber(ecfTipo, ncfSeq). Misma firma histórica (número, tipo). */
export const buildEcfNumberFromCotizacion = (
  cotizacionNumber: number,
  ecfTipo: string,
): string => buildEcfNumber(ecfTipo, cotizacionNumber);

/**
 * Código de tipo usado para elegir la **plantilla XML**: el **tipo de comprobante fiscal**
 * (`ecfTipo` en cotización / payload) tiene prioridad; solo si falta se infiere del prefijo `E{tipo}` del e-NCF.
 */
export function resolvePlantillaEcfTipo(payload: {
  ecfTipo?: string | null;
  ecfNumber: string;
}): string {
  const comprobante = String(payload.ecfTipo ?? "").trim();
  if (comprobante.length > 0) {
    return normalizeEcfTipo(comprobante);
  }
  const m = payload.ecfNumber.trim().match(/^E(\d{2})/);
  if (m?.[1]) {
    return normalizeEcfTipo(m[1].padStart(2, "0"));
  }
  return normalizeEcfTipo(DEFAULT_ECF_TIPO);
}
