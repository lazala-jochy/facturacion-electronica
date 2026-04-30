import { create } from "xmlbuilder2";
import type { EcfPayload } from "./validation";

const money = (value: number) => value.toFixed(2);
const qty = (value: number) => value.toFixed(2);
const dateYYYYMMDD = (value: Date) => value.toISOString().slice(0, 10).replace(/-/g, "");

export const buildEcfXml = (payload: EcfPayload): string => {
  const root = create({ version: "1.0", encoding: "UTF-8" })
    .ele("eCF", { version: "1.0" })
    .ele("Encabezado");

  root.ele("IdDoc").ele("eNCF").txt(payload.ecfNumber).up().up();

  const emisor = root.ele("Emisor");
  emisor.ele("RNCEmisor").txt(payload.issuer.rnc);
  emisor.ele("RazonSocialEmisor").txt(payload.issuer.name);
  emisor.ele("DireccionEmisor").txt(payload.issuer.address);
  if (payload.issuer.phone?.trim()) emisor.ele("TelefonoEmisor").txt(payload.issuer.phone.trim());
  if (payload.issuer.email?.trim()) emisor.ele("CorreoEmisor").txt(payload.issuer.email.trim());
  emisor.up();

  const comprador = root.ele("Comprador");
  comprador.ele("RNCComprador").txt(payload.buyer.rncCedula);
  comprador.ele("RazonSocialComprador").txt(payload.buyer.name);
  if (payload.buyer.address?.trim()) comprador.ele("DireccionComprador").txt(payload.buyer.address.trim());
  if (payload.buyer.contact?.trim()) comprador.ele("ContactoComprador").txt(payload.buyer.contact.trim());
  comprador.up();

  root.ele("FechaEmision").txt(dateYYYYMMDD(payload.issueDate));
  root.up();

  const detalle = root.up().ele("Detalle");
  for (const item of payload.items) {
    const line = detalle.ele("Item");
    line.ele("NumeroLinea").txt(String(item.itemNumber));
    line.ele("NombreItem").txt(item.description);
    line.ele("CantidadItem").txt(qty(item.quantity));
    line.ele("UnidadMedida").txt(item.unit);
    line.ele("PrecioUnitarioItem").txt(money(item.unitPrice));
    line.ele("MontoItem").txt(money(item.totalValue));
  }
  detalle.up();

  const totales = root.ele("Totales");
  totales.ele("MontoGravadoTotal").txt(money(payload.subtotal));
  totales.ele("ITBIS1").txt(money(payload.itbis));
  totales.ele("MontoTotal").txt(money(payload.total));

  return root.end({ prettyPrint: true });
};
