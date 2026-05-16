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

/** Tipos que requieren documento de referencia (NCFModificado) en envío. */
export const ECF_TIPO_REQUIERE_REFERENCIA = new Set(["33", "34"]);

export const ecfTipoLabel = (code: string | undefined | null): string => {
  if (!code?.trim()) return "";
  const opt = ECF_TIPO_OPTIONS.find((o) => o.value === code.trim());
  return opt?.label ?? code.trim();
};
