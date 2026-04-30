/** ITBIS estándar RD (18%). */
export const ITBIS_RATE = 0.18;

export type Totals = {
  subtotal: number;
  itbis: number;
  total: number;
};

/**
 * Calcula ITBIS y total a partir del subtotal (monto gravable sin impuesto).
 * total = subtotal + itbis
 */
export const calculateTotals = (subtotal: number): Totals => {
  const safe = Number.isFinite(subtotal) ? Math.max(0, subtotal) : 0;
  const itbis = Math.round(safe * ITBIS_RATE * 100) / 100;
  const total = Math.round((safe + itbis) * 100) / 100;
  return { subtotal: safe, itbis, total };
};

export const itemLineTotalValue = (quantity: number, unitPrice: number): number => {
  const q = Number.isFinite(quantity) ? quantity : 0;
  const p = Number.isFinite(unitPrice) ? unitPrice : 0;
  return Math.round(Math.max(0, q) * Math.max(0, p) * 100) / 100;
};

/** Línea con cantidad/precio o ya con total por línea. */
export type ItemForTotals =
  | { quantity: number; unitPrice: number }
  | { totalValue: number };

/**
 * subtotal = suma de líneas; itbis y total con ITBIS 18% (RD).
 */
export const calculateTotalsFromItems = (items: ItemForTotals[]): Totals => {
  const subtotal = items.reduce((sum, it) => {
    if ("totalValue" in it) {
      const v = Number.isFinite(it.totalValue) ? it.totalValue : 0;
      return sum + Math.max(0, v);
    }
    return sum + itemLineTotalValue(it.quantity, it.unitPrice);
  }, 0);
  return calculateTotals(subtotal);
};
