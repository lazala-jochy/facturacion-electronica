/** Estados de presupuesto (alineado a flujo DGII / facturación). */
export const PRESUPUESTO_STATUS = ["draft", "approved", "invoiced"] as const;
export type PresupuestoStatus = (typeof PRESUPUESTO_STATUS)[number];

export const isPresupuestoStatus = (v: string): v is PresupuestoStatus =>
  (PRESUPUESTO_STATUS as readonly string[]).includes(v);
