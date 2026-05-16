import { DEFAULT_ECF_TIPO } from "../config/ecfTipos";

/** Alineado a `buildEcfNumber` del backend (13 caracteres: E + tipo + secuencia 10). */
const ECF_NCF_SEQ_MAX = 10_000_000;

export function formatEcfNumberDisplay(
  ecfTipo: string | undefined | null,
  ncfSeq: number | null | undefined,
): string {
  const digits = String(ecfTipo ?? DEFAULT_ECF_TIPO).replace(/\D/g, "");
  const tipo =
    digits.length >= 2
      ? digits.slice(0, 2)
      : digits.length === 1
        ? `0${digits}`
        : DEFAULT_ECF_TIPO;
  const n = Number(ncfSeq);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const bounded = Math.min(Math.floor(n), ECF_NCF_SEQ_MAX);
  return `E${tipo}${String(bounded).padStart(10, "0")}`;
}
