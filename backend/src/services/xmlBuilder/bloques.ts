/**
 * Bloques reutilizables entre plantillas (Emisor, Totales, etc.).
 * Cada tipo define su propia secuencia IdDoc en su archivo `plantillas/ecf*.ts`.
 */

import type { EcfPayload, RfcePayload } from "../validation";
import {
  DEFAULT_COMPRADOR_MUNICIPIO,
  DEFAULT_COMPRADOR_PROVINCIA,
  EMISOR_DEFAULT_MUNICIPIO,
  EMISOR_DEFAULT_PROVINCIA,
  fechaEmisionDdMmYyyy,
  fechaHoraFirmaDgii,
  fechaLimitePagoDesdeEmision,
  indicadorBienServicio,
  mapUnidadMedidaDgii,
  money,
  qty,
  splitPhones,
  unitPrice4,
} from "./common";
import type { XMLBuilder } from "xmlbuilder2/lib/interfaces";

/** Cierre común IdDoc: TipoPago + TablaFormasPago (una forma). */
export function appendIdDocTipoPagoYFormas(idDoc: XMLBuilder, payload: EcfPayload): void {
  idDoc.ele("TipoPago").txt("1");
  const tabFormas = idDoc.ele("TablaFormasPago");
  const forma = tabFormas.ele("FormaDePago");
  forma.ele("FormaPago").txt("1");
  forma.ele("MontoPago").txt(money(payload.total));
  tabFormas.up();
}

export function appendEmisor(enc: XMLBuilder, payload: EcfPayload): void {
  const em = enc.ele("Emisor");
  em.ele("RNCEmisor").txt(payload.issuer.rnc.trim());
  em.ele("RazonSocialEmisor").txt(payload.issuer.name.trim());
  em.ele("NombreComercial").txt(payload.issuer.name.trim());
  em.ele("DireccionEmisor").txt(payload.issuer.address.trim());
  em.ele("Municipio").txt(EMISOR_DEFAULT_MUNICIPIO);
  em.ele("Provincia").txt(EMISOR_DEFAULT_PROVINCIA);
  const phones = splitPhones(payload.issuer.phone);
  if (phones.length) {
    const tabTel = em.ele("TablaTelefonoEmisor");
    for (const tel of phones) {
      tabTel.ele("TelefonoEmisor").txt(tel);
    }
    tabTel.up();
  }
  if (payload.issuer.email?.trim()) {
    em.ele("CorreoEmisor").txt(payload.issuer.email.trim());
  }
  em.ele("FechaEmision").txt(fechaEmisionDdMmYyyy(payload.issueDate));
  em.up();
}

/** e-CF 47 — comprador extranjero (muestra E470000000009). */
export function appendCompradorExtranjero47(enc: XMLBuilder, payload: EcfPayload): void {
  const id =
    (payload.buyer.identificadorExtranjero ?? payload.buyer.rncCedula).trim();
  const comp = enc.ele("Comprador");
  comp.ele("IdentificadorExtranjero").txt(id);
  comp.ele("RazonSocialComprador").txt(payload.buyer.name.trim());
  comp.up();
}

/** Comprador mínimo (muestra e-CF 41: solo RNC y razón social). */
export function appendCompradorMinimal(enc: XMLBuilder, payload: EcfPayload): void {
  const comp = enc.ele("Comprador");
  comp.ele("RNCComprador").txt(payload.buyer.rncCedula.trim());
  comp.ele("RazonSocialComprador").txt(payload.buyer.name.trim());
  comp.up();
}

export function appendComprador(enc: XMLBuilder, payload: EcfPayload): void {
  const comp = enc.ele("Comprador");
  comp.ele("RNCComprador").txt(payload.buyer.rncCedula.trim());
  comp.ele("RazonSocialComprador").txt(payload.buyer.name.trim());
  if (payload.buyer.contact?.trim()) {
    comp.ele("ContactoComprador").txt(payload.buyer.contact.trim());
  }
  if (payload.buyer.address?.trim()) {
    comp.ele("DireccionComprador").txt(payload.buyer.address.trim());
  }
  comp.ele("MunicipioComprador").txt(DEFAULT_COMPRADOR_MUNICIPIO);
  comp.ele("ProvinciaComprador").txt(DEFAULT_COMPRADOR_PROVINCIA);
  comp.up();
}

const round2 = (value: number) => Number(value.toFixed(2));

export function appendTotalesItbis18(enc: XMLBuilder, payload: EcfPayload): void {
  const tot = enc.ele("Totales");
  tot.ele("MontoGravadoTotal").txt(money(payload.subtotal));
  tot.ele("MontoGravadoI1").txt(money(payload.subtotal));
  tot.ele("ITBIS1").txt("18");
  tot.ele("TotalITBIS").txt(money(payload.itbis));
  tot.ele("TotalITBIS1").txt(money(payload.itbis));
  tot.ele("MontoTotal").txt(money(payload.total));
  tot.up();
}

export function appendEmisorRfce32(enc: XMLBuilder, payload: RfcePayload): void {
  const em = enc.ele("Emisor");
  em.ele("RNCEmisor").txt(payload.issuer.rnc.trim());
  em.ele("RazonSocialEmisor").txt(payload.issuer.name.trim());
  em.ele("FechaEmision").txt(fechaEmisionDdMmYyyy(payload.issueDate));
  em.up();
}

export function appendCompradorRfce32(enc: XMLBuilder, payload: RfcePayload): void {
  const comp = enc.ele("Comprador");
  comp.ele("RNCComprador").txt(payload.buyer.rncCedula.trim());
  comp.ele("RazonSocialComprador").txt(payload.buyer.name.trim());
  comp.up();
}

/** Totales RFCE 32: sin `ITBIS1` (XSD resumen E320000000011 / lote Excel). */
export function appendTotalesRfce32(enc: XMLBuilder, payload: RfcePayload): void {
  const tot = enc.ele("Totales");
  if (payload.exento) {
    tot.ele("MontoExento").txt(money(payload.subtotal));
    tot.ele("MontoTotal").txt(money(payload.total));
    tot.up();
    return;
  }
  tot.ele("MontoGravadoTotal").txt(money(payload.subtotal));
  tot.ele("MontoGravadoI1").txt(money(payload.subtotal));
  tot.ele("TotalITBIS").txt(money(payload.itbis));
  tot.ele("TotalITBIS1").txt(money(payload.itbis));
  tot.ele("MontoTotal").txt(money(payload.total));
  tot.up();
}

function gravadoPorIndicadorFacturacion(payload: EcfPayload): { i1: number; i2: number } {
  let i1 = 0;
  let i2 = 0;
  for (const item of payload.items) {
    if (item.indicadorFacturacion === "2") {
      i2 = round2(i2 + item.totalValue);
    } else {
      i1 = round2(i1 + item.totalValue);
    }
  }
  if (i1 <= 0 && i2 <= 0 && payload.subtotal > 0) {
    i1 = round2(payload.subtotal);
  }
  return { i1, i2 };
}

/** e-CF 45 — gubernamental: ITBIS 18% + 16% opcional, ValorPagar (muestra E450000000002). */
export function appendTotalesGubernamental45(enc: XMLBuilder, payload: EcfPayload): void {
  const { i1: gravadoI1, i2: gravadoI2 } = gravadoPorIndicadorFacturacion(payload);
  const dual = gravadoI2 > 0.001;
  const itbis1 = dual ? round2(gravadoI1 * 0.18) : round2(payload.itbis);
  const itbis2 = dual ? round2(gravadoI2 * 0.16) : 0;
  const totalItbis = dual ? round2(itbis1 + itbis2) : round2(payload.itbis);

  const tot = enc.ele("Totales");
  tot.ele("MontoGravadoTotal").txt(money(payload.subtotal));
  tot.ele("MontoGravadoI1").txt(money(gravadoI1));
  if (dual) {
    tot.ele("MontoGravadoI2").txt(money(gravadoI2));
  }
  tot.ele("ITBIS1").txt("18");
  if (dual) {
    tot.ele("ITBIS2").txt("16");
  }
  tot.ele("TotalITBIS").txt(money(totalItbis));
  tot.ele("TotalITBIS1").txt(money(itbis1));
  if (dual) {
    tot.ele("TotalITBIS2").txt(money(itbis2));
  }
  tot.ele("MontoTotal").txt(money(payload.total));
  tot.ele("ValorPagar").txt(money(payload.total));
  tot.up();
}

/** Monto gravado exportación (sin ITBIS): debe ser la base de MontoTotal y MontoPago. */
export function gravadoExportacion46(payload: EcfPayload): number {
  const fromItems = round2(payload.items.reduce((acc, i) => acc + i.totalValue, 0));
  return payload.subtotal > 0 ? round2(payload.subtotal) : fromItems;
}

/** e-CF 46 — IdDoc crédito (muestra E460000000001). */
export function appendIdDocExportacion46(idDoc: XMLBuilder, payload: EcfPayload): void {
  const gravado = gravadoExportacion46(payload);
  const tipoPago = payload.tipoPago ?? "2";
  const formaPago = payload.formaPago ?? "2";
  idDoc.ele("TipoPago").txt(tipoPago);
  idDoc
    .ele("FechaLimitePago")
    .txt(payload.fechaLimitePago ?? fechaLimitePagoDesdeEmision(payload.issueDate));
  idDoc.ele("TerminoPago").txt(payload.terminoPago ?? "1 mes");
  const tabFormas = idDoc.ele("TablaFormasPago");
  const forma = tabFormas.ele("FormaDePago");
  forma.ele("FormaPago").txt(formaPago);
  forma.ele("MontoPago").txt(money(gravado));
  tabFormas.up();
}

/** e-CF 46 — exportación: gravado I3, ITBIS 0% (muestra E460000000001). */
export function appendTotalesExportacion46(enc: XMLBuilder, payload: EcfPayload): void {
  const gravado = gravadoExportacion46(payload);
  const tot = enc.ele("Totales");
  tot.ele("MontoGravadoTotal").txt(money(gravado));
  tot.ele("MontoGravadoI3").txt(money(gravado));
  tot.ele("ITBIS3").txt("0");
  tot.ele("TotalITBIS").txt("0.00");
  tot.ele("TotalITBIS3").txt("0.00");
  tot.ele("MontoTotal").txt(money(gravado));
  tot.up();
}

function montoExentoFromPayload(payload: EcfPayload): number {
  const fromItems = round2(payload.items.reduce((acc, i) => acc + i.totalValue, 0));
  return payload.subtotal > 0 ? round2(payload.subtotal) : fromItems;
}

/** e-CF 47 — pago al exterior: exento + retención ISR (muestra E470000000009). */
export function appendTotalesPagoExterior47(enc: XMLBuilder, payload: EcfPayload): void {
  const exento = montoExentoFromPayload(payload);
  const totalIsr =
    payload.totalIsrRetencion != null
      ? round2(payload.totalIsrRetencion)
      : round2(exento * 0.27);
  const tot = enc.ele("Totales");
  tot.ele("MontoExento").txt(money(exento));
  tot.ele("MontoTotal").txt(money(exento));
  tot.ele("MontoPeriodo").txt(money(exento));
  tot.ele("ValorPagar").txt(money(exento));
  tot.ele("TotalISRRetencion").txt(money(totalIsr));
  tot.up();
}

/** e-CF 47: fact. 4, retención ISR por línea (27% por defecto). */
export function appendDetallesItemsPagoExterior47(root: XMLBuilder, payload: EcfPayload): void {
  const exento = montoExentoFromPayload(payload);
  const totalIsr =
    payload.totalIsrRetencion != null
      ? round2(payload.totalIsrRetencion)
      : round2(exento * 0.27);
  const isrPerLine = prorateByLineTotal(
    payload.items,
    exento,
    totalIsr,
    (i) => i.montoIsrRetenido,
  );

  const detalles = root.ele("DetallesItems");
  payload.items.forEach((item, idx) => {
    const line = detalles.ele("Item");
    line.ele("NumeroLinea").txt(String(item.itemNumber));
    line.ele("IndicadorFacturacion").txt("4");
    const ret = line.ele("Retencion");
    ret.ele("IndicadorAgenteRetencionoPercepcion").txt("1");
    ret.ele("MontoISRRetenido").txt(money(isrPerLine[idx]));
    ret.up();
    line.ele("NombreItem").txt(item.description.trim());
    line.ele("IndicadorBienoServicio").txt("2");
    line.ele("CantidadItem").txt(qty(item.quantity));
    line.ele("UnidadMedida").txt(mapUnidadMedidaDgii(item.unit));
    line.ele("PrecioUnitarioItem").txt(unitPrice4(item.unitPrice));
    line.ele("MontoItem").txt(money(item.totalValue));
  });
  detalles.up();
}

/** e-CF 46: IndicadorFacturacion 3, TablaCodigosItem opcional. */
export function appendDetallesItemsExportacion46(root: XMLBuilder, payload: EcfPayload): void {
  const detalles = root.ele("DetallesItems");
  for (const item of payload.items) {
    const line = detalles.ele("Item");
    line.ele("NumeroLinea").txt(String(item.itemNumber));
    const codigo = (item.codigoItem ?? "").trim();
    if (codigo) {
      const tabla = line.ele("TablaCodigosItem");
      const cod = tabla.ele("CodigosItem");
      cod.ele("TipoCodigo").txt((item.tipoCodigoItem ?? "INTERNA").trim());
      cod.ele("CodigoItem").txt(codigo);
      cod.up();
      tabla.up();
    }
    line.ele("IndicadorFacturacion").txt("3");
    line.ele("NombreItem").txt(item.description.trim());
    line.ele("IndicadorBienoServicio").txt(
      indicadorBienServicio(item.unit, item.description),
    );
    line.ele("CantidadItem").txt(qty(item.quantity));
    line.ele("UnidadMedida").txt(mapUnidadMedidaDgii(item.unit));
    line.ele("PrecioUnitarioItem").txt(money(item.unitPrice));
    line.ele("MontoItem").txt(money(item.totalValue));
  }
  detalles.up();
}

/** e-CF 45: IndicadorFacturacion 1|2 por línea, precio 4 decimales. */
export function appendDetallesItemsGubernamental45(root: XMLBuilder, payload: EcfPayload): void {
  const detalles = root.ele("DetallesItems");
  for (const item of payload.items) {
    const line = detalles.ele("Item");
    line.ele("NumeroLinea").txt(String(item.itemNumber));
    line.ele("IndicadorFacturacion").txt(item.indicadorFacturacion ?? "1");
    line.ele("NombreItem").txt(item.description.trim());
    line.ele("IndicadorBienoServicio").txt(
      indicadorBienServicio(item.unit, item.description),
    );
    line.ele("CantidadItem").txt(qty(item.quantity));
    line.ele("UnidadMedida").txt(mapUnidadMedidaDgii(item.unit));
    line.ele("PrecioUnitarioItem").txt(unitPrice4(item.unitPrice));
    line.ele("MontoItem").txt(money(item.totalValue));
  }
  detalles.up();
}

/** Reparte un total entre líneas según peso (totalValue); ajusta la última por redondeo. */
function prorateByLineTotal(
  items: EcfPayload["items"],
  subtotal: number,
  target: number,
  pick: (item: EcfPayload["items"][number]) => number | undefined,
): number[] {
  if (!items.length || target <= 0) return items.map(() => 0);
  const explicit = items.map((i) => pick(i));
  if (explicit.every((v) => v != null && v >= 0)) {
    return explicit.map((v) => round2(v ?? 0));
  }
  const base = subtotal > 0 ? subtotal : items.reduce((a, i) => a + i.totalValue, 0);
  const out: number[] = [];
  let assigned = 0;
  for (let i = 0; i < items.length; i++) {
    if (i === items.length - 1) {
      out.push(round2(target - assigned));
    } else {
      const share = base > 0 ? round2((target * items[i].totalValue) / base) : 0;
      out.push(share);
      assigned = round2(assigned + share);
    }
  }
  return out;
}

/** e-CF 41 — compras: ITBIS gravado + retenciones en totales (muestra E410000000007). */
export function appendTotalesCompras41(enc: XMLBuilder, payload: EcfPayload): void {
  const totalItbisRet =
    payload.totalItbisRetenido != null
      ? round2(payload.totalItbisRetenido)
      : round2(payload.itbis);
  const totalIsr =
    payload.totalIsrRetencion != null
      ? round2(payload.totalIsrRetencion)
      : round2(payload.subtotal * 0.1);

  const tot = enc.ele("Totales");
  tot.ele("MontoGravadoTotal").txt(money(payload.subtotal));
  tot.ele("MontoGravadoI1").txt(money(payload.subtotal));
  tot.ele("ITBIS1").txt("18");
  tot.ele("TotalITBIS").txt(money(payload.itbis));
  tot.ele("TotalITBIS1").txt(money(payload.itbis));
  tot.ele("MontoTotal").txt(money(payload.total));
  tot.ele("TotalITBISRetenido").txt(money(totalItbisRet));
  tot.ele("TotalISRRetencion").txt(money(totalIsr));
  tot.up();
}

/** e-CF 41 — ítems con Retencion antes de NombreItem (orden muestra DGII). */
export function appendDetallesItemsCompras41(root: XMLBuilder, payload: EcfPayload): void {
  const totalItbisRet =
    payload.totalItbisRetenido != null
      ? round2(payload.totalItbisRetenido)
      : round2(payload.itbis);
  const totalIsr =
    payload.totalIsrRetencion != null
      ? round2(payload.totalIsrRetencion)
      : round2(payload.subtotal * 0.1);

  const itbisPerLine = prorateByLineTotal(
    payload.items,
    payload.subtotal,
    totalItbisRet,
    (i) => i.montoItbisRetenido,
  );
  const isrPerLine = prorateByLineTotal(
    payload.items,
    payload.subtotal,
    totalIsr,
    (i) => i.montoIsrRetenido,
  );

  const detalles = root.ele("DetallesItems");
  payload.items.forEach((item, idx) => {
    const line = detalles.ele("Item");
    line.ele("NumeroLinea").txt(String(item.itemNumber));
    line.ele("IndicadorFacturacion").txt("1");
    const ret = line.ele("Retencion");
    ret.ele("IndicadorAgenteRetencionoPercepcion").txt("1");
    ret.ele("MontoITBISRetenido").txt(money(itbisPerLine[idx]));
    ret.ele("MontoISRRetenido").txt(money(isrPerLine[idx]));
    ret.up();
    line.ele("NombreItem").txt(item.description.trim());
    line.ele("IndicadorBienoServicio").txt(indicadorBienServicio(item.unit, item.description));
    line.ele("CantidadItem").txt(qty(item.quantity));
    line.ele("UnidadMedida").txt(mapUnidadMedidaDgii(item.unit));
    line.ele("PrecioUnitarioItem").txt(unitPrice4(item.unitPrice));
    line.ele("MontoItem").txt(money(item.totalValue));
  });
  detalles.up();
}

/** Muestra DGII E340000000016 (NC certificación sin ITBIS en totales). */
export function appendTotalesMontoNoFacturable(enc: XMLBuilder, payload: EcfPayload): void {
  const tot = enc.ele("Totales");
  tot.ele("MontoTotal").txt("0.00");
  tot.ele("MontoNoFacturable").txt(money(payload.total));
  tot.up();
}

/** Gastos menores e-CF 43: MontoExento + MontoTotal (muestra E430000000011). */
export function appendTotalesExento(enc: XMLBuilder, payload: EcfPayload): void {
  const exento = payload.itbis > 0 ? payload.subtotal : payload.total;
  const tot = enc.ele("Totales");
  tot.ele("MontoExento").txt(money(exento));
  tot.ele("MontoTotal").txt(money(payload.total));
  tot.up();
}

/** e-CF 43: ambos totales iguales, sin ITBIS (muestra DGII E430000000011). */
export function appendTotalesGastosMenores43(enc: XMLBuilder, payload: EcfPayload): void {
  const monto =
    payload.subtotal > 0
      ? round2(payload.subtotal)
      : round2(payload.items.reduce((acc, i) => acc + i.totalValue, 0));
  const tot = enc.ele("Totales");
  tot.ele("MontoExento").txt(money(monto));
  tot.ele("MontoTotal").txt(money(monto));
  tot.up();
}

/** e-CF 44 — régimen especial: totales exentos (muestra E440000000010). */
export function appendTotalesRegimenEspecial44(enc: XMLBuilder, payload: EcfPayload): void {
  const monto =
    payload.subtotal > 0
      ? round2(payload.subtotal)
      : round2(payload.items.reduce((acc, i) => acc + i.totalValue, 0));
  const tot = enc.ele("Totales");
  tot.ele("MontoExento").txt(money(monto));
  tot.ele("MontoTotal").txt(money(monto));
  tot.ele("MontoPeriodo").txt(money(monto));
  tot.ele("ValorPagar").txt(money(monto));
  tot.up();
}

/** e-CF 44: IndicadorFacturacion 4, bienes (muestra E440000000010). */
export function appendDetallesItemsRegimenEspecial44(root: XMLBuilder, payload: EcfPayload): void {
  const detalles = root.ele("DetallesItems");
  for (const item of payload.items) {
    const line = detalles.ele("Item");
    line.ele("NumeroLinea").txt(String(item.itemNumber));
    line.ele("IndicadorFacturacion").txt("4");
    line.ele("NombreItem").txt(item.description.trim());
    line.ele("IndicadorBienoServicio").txt(
      indicadorBienServicio(item.unit, item.description),
    );
    line.ele("CantidadItem").txt(qty(item.quantity));
    line.ele("UnidadMedida").txt(mapUnidadMedidaDgii(item.unit));
    line.ele("PrecioUnitarioItem").txt(unitPrice4(item.unitPrice));
    line.ele("MontoItem").txt(money(item.totalValue));
  }
  detalles.up();
}

/** e-CF 43: IndicadorFacturacion 4, IndicadorBienoServicio 2 (muestra E430000000011). */
export function appendDetallesItemsGastosMenores43(root: XMLBuilder, payload: EcfPayload): void {
  const detalles = root.ele("DetallesItems");
  for (const item of payload.items) {
    const line = detalles.ele("Item");
    line.ele("NumeroLinea").txt(String(item.itemNumber));
    line.ele("IndicadorFacturacion").txt("4");
    line.ele("NombreItem").txt(item.description.trim());
    line.ele("IndicadorBienoServicio").txt("2");
    line.ele("CantidadItem").txt(qty(item.quantity));
    line.ele("UnidadMedida").txt(mapUnidadMedidaDgii(item.unit));
    line.ele("PrecioUnitarioItem").txt(money(item.unitPrice));
    line.ele("MontoItem").txt(money(item.totalValue));
  }
  detalles.up();
}

export function appendDetallesItems(
  root: XMLBuilder,
  payload: EcfPayload,
  indicadorFacturacion: "0" | "1" | "4" = "1",
): void {
  const detalles = root.ele("DetallesItems");
  for (const item of payload.items) {
    const line = detalles.ele("Item");
    line.ele("NumeroLinea").txt(String(item.itemNumber));
    line.ele("IndicadorFacturacion").txt(indicadorFacturacion);
    line.ele("NombreItem").txt(item.description.trim());
    line.ele("IndicadorBienoServicio").txt(indicadorBienServicio(item.unit, item.description));
    line.ele("CantidadItem").txt(qty(item.quantity));
    line.ele("UnidadMedida").txt(mapUnidadMedidaDgii(item.unit));
    line.ele("PrecioUnitarioItem").txt(money(item.unitPrice));
    line.ele("MontoItem").txt(money(item.totalValue));
  }
  detalles.up();
}

export function appendFechaHoraFirma(root: XMLBuilder): void {
  root.ele("FechaHoraFirma").txt(fechaHoraFirmaDgii());
}

/** Referencia al comprobante modificado (notas 33/34): va fuera de IdDoc, tras DetallesItems. */
export function appendInformacionReferencia(
  root: XMLBuilder,
  payload: EcfPayload,
  codigoModificacion: string,
): void {
  const ref = (payload.referenceEncf ?? "").trim();
  if (!ref) return;

  const info = root.ele("InformacionReferencia");
  info.ele("NCFModificado").txt(ref);
  info.ele("FechaNCFModificado").txt(fechaEmisionDdMmYyyy(payload.issueDate));
  info.ele("CodigoModificacion").txt(codigoModificacion);
  info.up();
}
