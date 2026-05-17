/** Opciones UI alineadas a nomenclatura DGII (cotizaciones / e-CF). */

export const ECF_TIPO_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "31", label: "31 - Factura Crédito Fiscal" },
  { value: "32", label: "32 - Factura de Consumo" },
  { value: "33", label: "33 - Nota Débito" },
  { value: "34", label: "34 - Nota Crédito" },
  { value: "41", label: "41 - Compras" },
  { value: "43", label: "43 - Gastos Menores" },
  { value: "44", label: "44 - Régimen Especial" },
  { value: "45", label: "45 - Gubernamental" },
  { value: "46", label: "46 - Exportación" },
  { value: "47", label: "47 - Pagos Exterior" },
];

export const DEFAULT_ECF_TIPO = "31";

/** Umbral DGII: consumo 32 &lt; este monto exige RFCE antes del e-CF íntegro en certificación. */
export const ECF_CONSUMO_RFCE_THRESHOLD_RD = 250_000;

export const isConsumoMenor250Rfce = (
  ecfTipo: string | undefined | null,
  total: number | undefined | null,
): boolean =>
  String(ecfTipo ?? "").trim() === "32" &&
  typeof total === "number" &&
  Number.isFinite(total) &&
  total < ECF_CONSUMO_RFCE_THRESHOLD_RD;

/** Etiqueta explícita en UI para tipo 32 &lt; 250k (flujo RFCE). */
export const ECF_TIPO_32_RFCE_LABEL = "32 — Consumo RFCE (<250k)";

export const ecfTipoDisplayLabel = (
  ecfTipo: string | undefined | null,
  total?: number | null,
): string => {
  if (isConsumoMenor250Rfce(ecfTipo, total ?? null)) return ECF_TIPO_32_RFCE_LABEL;
  return ecfTipoLabel(ecfTipo);
};

/** Tipos que requieren documento de referencia (NCFModificado) en envío. */
export const ECF_TIPO_REQUIERE_REFERENCIA = new Set(["33", "34"]);

export const ecfTipoLabel = (code: string | undefined | null): string => {
  if (!code?.trim()) return "";
  const opt = ECF_TIPO_OPTIONS.find((o) => o.value === code.trim());
  return opt?.label ?? code.trim();
};
