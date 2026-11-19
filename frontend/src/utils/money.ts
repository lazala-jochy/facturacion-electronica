/** "1000.00" confunde; "1,000.00" no. Separador de miles + 2 decimales, sin símbolo de moneda. */
export const formatMoney = (value: number): string =>
  new Intl.NumberFormat("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
