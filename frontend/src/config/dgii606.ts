/** Catálogos Formato 606 — alineados a plantilla DGII NG 07-2018 / 05-2019. */

export const DGII_606_TIPO_BIENES = [
  { code: "01", label: "Gastos de personal" },
  { code: "02", label: "Trabajos, suministros y servicios" },
  { code: "03", label: "Arrendamientos" },
  { code: "04", label: "Gastos de activos fijo" },
  { code: "05", label: "Gastos de representación" },
  { code: "06", label: "Otras deducciones admitidas" },
  { code: "07", label: "Gastos financieros" },
  { code: "08", label: "Gastos extraordinarios" },
  { code: "09", label: "Costo de venta" },
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

export const DGII_606_TIPO_RET_ISR = [
  { code: "", label: "Sin retención ISR" },
  { code: "01", label: "Alquileres" },
  { code: "02", label: "Honorarios por servicios" },
  { code: "03", label: "Otras rentas" },
  { code: "04", label: "Otras rentas (presuntas)" },
  { code: "05", label: "Intereses — persona jurídica" },
  { code: "06", label: "Intereses — persona física" },
  { code: "07", label: "Retención proveedores del Estado" },
  { code: "08", label: "Juegos telefónicos" },
  { code: "09", label: "Ganadería carne bovina" },
] as const;
