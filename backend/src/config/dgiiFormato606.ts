/** Catálogos del Formato 606 (NG 07-2018 / 05-2019) — hoja «Herramienta Formato 606». */

export const DGII_606_TIPO_BIENES_SERVICIOS = [
  { code: "01", label: "Gastos de personal" },
  { code: "02", label: "Gastos por trabajos, suministros y servicios" },
  { code: "03", label: "Arrendamientos" },
  { code: "04", label: "Gastos de activos fijo" },
  { code: "05", label: "Gastos de representación" },
  { code: "06", label: "Otras deducciones admitidas" },
  { code: "07", label: "Gastos financieros" },
  { code: "08", label: "Gastos extraordinarios" },
  { code: "09", label: "Compras y gastos que formarán parte del costo de venta" },
  { code: "10", label: "Adquisiciones de activos" },
  { code: "11", label: "Gastos de seguros" },
] as const;

export const DGII_606_FORMA_PAGO = [
  { code: "01", label: "Efectivo" },
  { code: "02", label: "Cheques / transferencias / depósito" },
  { code: "03", label: "Tarjeta crédito / débito" },
  { code: "04", label: "Compra a crédito" },
  { code: "05", label: "Permuta" },
  { code: "06", label: "Nota de crédito" },
  { code: "07", label: "Mixto" },
] as const;

export const DGII_606_TIPO_RETENCION_ISR = [
  { code: "", label: "(Sin retención ISR)" },
  { code: "01", label: "Alquileres" },
  { code: "02", label: "Honorarios por servicios" },
  { code: "03", label: "Otras rentas" },
  { code: "04", label: "Otras rentas (rentas presuntas)" },
  { code: "05", label: "Intereses pagados a personas jurídicas residentes" },
  { code: "06", label: "Intereses pagados a personas físicas residentes" },
  { code: "07", label: "Retención por proveedores del Estado" },
  { code: "08", label: "Juegos telefónicos" },
  { code: "09", label: "Retenciones subsector ganadería carne bovina" },
] as const;

export const isValid606TipoBienes = (code: string): boolean =>
  DGII_606_TIPO_BIENES_SERVICIOS.some((t) => t.code === code);

export const isValid606FormaPago = (code: string): boolean =>
  DGII_606_FORMA_PAGO.some((t) => t.code === code);
