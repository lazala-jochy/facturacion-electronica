/**
 * Bloques reutilizables entre plantillas (Emisor, Totales, etc.).
 * Cada tipo define su propia secuencia IdDoc en su archivo `plantillas/ecf*.ts`.
 */

import type { EcfPayload } from "../validation";
import {
  DEFAULT_COMPRADOR_MUNICIPIO,
  DEFAULT_COMPRADOR_PROVINCIA,
  EMISOR_DEFAULT_MUNICIPIO,
  EMISOR_DEFAULT_PROVINCIA,
  fechaEmisionDdMmYyyy,
  fechaHoraFirmaDgii,
  indicadorBienServicio,
  mapUnidadMedidaDgii,
  money,
  qty,
  splitPhones,
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

export function appendDetallesItems(root: XMLBuilder, payload: EcfPayload): void {
  const detalles = root.ele("DetallesItems");
  for (const item of payload.items) {
    const line = detalles.ele("Item");
    line.ele("NumeroLinea").txt(String(item.itemNumber));
    line.ele("IndicadorFacturacion").txt("1");
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
