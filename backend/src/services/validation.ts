import { normalizeEcfTipo, resolvePlantillaEcfTipo } from "../utils/ecfTipo";
import { resolveCodigoModificacionNotaCredito } from "./xmlBuilder/common";

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
  /** e-CF 47: IdentificadorExtranjero (si no se indica, se usa rncCedula). */
  identificadorExtranjero?: string;
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
  /** DGII IndicadorBienoServicio: 1=bien, 2=servicio. Si falta, se infiere de unit/description. */
  indicadorBienServicio?: "1" | "2";
  /** e-CF 45: 1=gravado ITBIS 18%, 2=gravado ITBIS 16% (muestra E450000000002). */
  indicadorFacturacion?: "1" | "2";
  /** e-CF 46: código interno del ítem (TablaCodigosItem). */
  codigoItem?: string;
  tipoCodigoItem?: string;
  /** e-CF 41: retención ITBIS por línea (opcional; se prorratea si falta). */
  montoItbisRetenido?: number;
  /** e-CF 41: retención ISR por línea (opcional; se prorratea si falta). */
  montoIsrRetenido?: number;
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
  /** Exenta de ITBIS: usa bloque de totales exentos (MontoExento) e IndicadorFacturacion 4 por ítem. */
  exento?: boolean;
  /** Tipo de comprobante fiscal DGII (31, 32, …); determina la plantilla XML y debe alinear el prefijo del e-NCF. */
  ecfTipo?: string;
  /** e-NCF documento modificado / referencia (p. ej. notas crédito/débito). */
  referenceEncf?: string | null;
  /** e-CF 34: 2 = corrige texto (total 0), 3 = corrige montos. Si se omite, se infiere del total. */
  codigoModificacion?: string | null;
  /** e-CF 41: totales de retención en encabezado (opcional). */
  totalItbisRetenido?: number;
  totalIsrRetencion?: number;
  /** Tipo de pago DGII: 1=Contado, 2=Crédito, 3=Gratuito. */
  tipoPago?: "1" | "2" | "3";
  /** Forma de pago DGII (TablaFormasPago): 1=Efectivo, 2=Cheque/Transferencia/Depósito,
   *  3=Tarjeta, 4=Venta a crédito, 5=Bonos, 6=Permuta, 7=Nota de crédito, 8=Otras. */
  formaPago?: "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";
  /** DD-MM-YYYY. Solo aplica (y es obligatorio) si tipoPago = "2". */
  fechaLimitePago?: string;
  terminoPago?: string;
};

const round2 = (value: number) => Number(value.toFixed(2));

const isPositiveNumber = (value: number) => Number.isFinite(value) && value >= 0;
/** DGII Decimal18D2ValidationTypeMayor: MontoItem y montos de línea deben ser > 0. */
const isStrictlyPositive = (value: number) => Number.isFinite(value) && value > 0;

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
    if (!isStrictlyPositive(item.quantity)) {
      errors.push(`Item ${idx + 1}: la cantidad debe ser mayor que cero.`);
    }
    if (!isStrictlyPositive(item.unitPrice)) {
      errors.push(`Item ${idx + 1}: el precio unitario debe ser mayor que cero.`);
    }
    if (!isStrictlyPositive(item.totalValue)) {
      errors.push(
        `Item ${idx + 1}: el monto de línea (MontoItem) debe ser mayor que cero; revisá cantidad y precio.`,
      );
    }
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
  const t = resolvePlantillaEcfTipo(payload);
  if (t === "46" || t === "47") {
    const exento = round2(payload.items.reduce((acc, i) => acc + i.totalValue, 0));
    const base = payload.subtotal > 0 ? round2(payload.subtotal) : exento;
    if (payload.itbis > 0.001) {
      errors.push(`Tipo ${t} (${t === "46" ? "exportación" : "pago al exterior"}): el ITBIS debe ser cero.`);
    }
    if (Math.abs(base - round2(payload.total)) > 0.01) {
      errors.push(`Tipo ${t}: el total debe coincidir con el monto exento (sin ITBIS).`);
    }
  } else {
    const recomputedTotal = round2(payload.subtotal + payload.itbis);
    if (Math.abs(recomputedTotal - round2(payload.total)) > 0.01) {
      errors.push("Total no coincide con subtotal + ITBIS.");
    }
  }

  if ((t === "33" || t === "34") && !String(payload.referenceEncf ?? "").trim()) {
    errors.push("Tipo 33/34: debe incluirse NCFModificado (documento de referencia).");
  }

  if (t === "34") {
    const codMod = resolveCodigoModificacionNotaCredito(
      payload.total,
      payload.codigoModificacion,
    );
    if (codMod === "2" && round2(payload.total) > 0.001) {
      errors.push(
        "Tipo 34: el código de modificación 2 (Corrige texto) exige monto total en cero. Para reducir montos del e-CF referenciado dejá montos en la cotización (se usará código 3 automáticamente) o indicá codigo_modificacion 3.",
      );
    }
  }

  const tipoDeclarado = String(payload.ecfTipo ?? "").trim();
  const fromEncf = payload.ecfNumber.trim().match(/^E(\d{2})/)?.[1];
  if (tipoDeclarado.length > 0 && fromEncf) {
    const td = normalizeEcfTipo(tipoDeclarado);
    const te = normalizeEcfTipo(fromEncf.padStart(2, "0"));
    if (td !== te) {
      errors.push(
        "El tipo de comprobante fiscal no coincide con el prefijo del e-NCF (p. ej. tipo 32 con número E31…). Unificá tipo y secuencia.",
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/** Payload para RFCE 32 (resumen consumo &lt; RD$250.000). */
export type RfcePayload = {
  ecfNumber: string;
  issueDate: Date;
  issuer: EcfIssuer;
  buyer: EcfBuyer;
  subtotal: number;
  itbis: number;
  total: number;
  exento?: boolean;
  tipoPago?: "1" | "2" | "3";
  codigoSeguridadeCF: string;
};
