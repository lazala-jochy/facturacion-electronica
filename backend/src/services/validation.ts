type EcfIssuer = {
  rnc: string;
  name: string;
  address: string;
  phone?: string | null;
  email?: string | null;
};

type EcfBuyer = {
  name: string;
  rncCedula: string;
  address?: string | null;
  contact?: string | null;
};

type EcfItem = {
  itemNumber: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalValue: number;
};

export type EcfPayload = {
  ecfNumber: string;
  issueDate: Date;
  issuer: EcfIssuer;
  buyer: EcfBuyer;
  items: EcfItem[];
  subtotal: number;
  itbis: number;
  total: number;
};

const round2 = (value: number) => Number(value.toFixed(2));

const isPositiveNumber = (value: number) => Number.isFinite(value) && value >= 0;

export const validateEcfPayload = (payload: EcfPayload) => {
  const errors: string[] = [];

  if (!payload.ecfNumber.trim()) errors.push("Numero e-CF obligatorio.");
  if (!payload.issuer.rnc.trim()) errors.push("RNC del emisor obligatorio.");
  if (!payload.issuer.name.trim()) errors.push("Nombre del emisor obligatorio.");
  if (!payload.issuer.address.trim()) errors.push("Direccion del emisor obligatoria.");
  if (!payload.buyer.name.trim()) errors.push("Nombre del comprador obligatorio.");
  if (!payload.buyer.rncCedula.trim()) errors.push("RNC/Cedula del comprador obligatorio.");
  if (!payload.items.length) errors.push("Debe incluir al menos un item.");

  payload.items.forEach((item, idx) => {
    if (!item.description.trim()) errors.push(`Item ${idx + 1}: descripcion obligatoria.`);
    if (!item.unit.trim()) errors.push(`Item ${idx + 1}: unidad obligatoria.`);
    if (!isPositiveNumber(item.quantity)) errors.push(`Item ${idx + 1}: cantidad invalida.`);
    if (!isPositiveNumber(item.unitPrice))
      errors.push(`Item ${idx + 1}: precio unitario invalido.`);
    if (!isPositiveNumber(item.totalValue))
      errors.push(`Item ${idx + 1}: total de linea invalido.`);
    const expected = round2(item.quantity * item.unitPrice);
    if (Math.abs(expected - round2(item.totalValue)) > 0.01) {
      errors.push(`Item ${idx + 1}: total de linea no coincide con cantidad x precio.`);
    }
  });

  if (!isPositiveNumber(payload.subtotal)) errors.push("Subtotal invalido.");
  if (!isPositiveNumber(payload.itbis)) errors.push("ITBIS invalido.");
  if (!isPositiveNumber(payload.total)) errors.push("Total invalido.");

  const recomputedSubtotal = round2(payload.items.reduce((acc, i) => acc + i.totalValue, 0));
  if (Math.abs(recomputedSubtotal - round2(payload.subtotal)) > 0.01) {
    errors.push("Subtotal no coincide con la suma de items.");
  }
  const recomputedTotal = round2(payload.subtotal + payload.itbis);
  if (Math.abs(recomputedTotal - round2(payload.total)) > 0.01) {
    errors.push("Total no coincide con subtotal + ITBIS.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};
