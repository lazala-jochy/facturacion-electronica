/** ITBIS RD 18% — alineado con backend. */
export const ITBIS_RATE = 0.18;

export type Totals = {
  subtotal: number;
  itbis: number;
  total: number;
};

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

export type ItemForTotals =
  | { quantity: number; unitPrice: number }
  | { totalValue: number };

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
