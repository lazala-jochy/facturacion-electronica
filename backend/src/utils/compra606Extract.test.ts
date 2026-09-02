import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFacturaCompraTexto } from "./compra606Extract";

test("parseFacturaCompraTexto: factura con NCF antiguo (formato B) y RNC con guiones", () => {
  const texto = `FERRETERIA POPULAR SRL
RNC: 131-88073-8
NCF: B0100000045
Fecha: 15/05/2026
Subtotal: RD$ 10,000.00
ITBIS: RD$ 1,800.00
TOTAL A PAGAR: RD$ 11,800.00
Forma de pago: Efectivo`;
  const out = parseFacturaCompraTexto(texto);
  assert.equal(out.rnc_cedula, "131880738");
  assert.equal(out.ncf, "B0100000045");
  assert.equal(out.fecha_comprobante, "20260515");
  assert.equal(out.monto_servicios, 10000);
  assert.equal(out.itbis_facturado, 1800);
  assert.equal(out.forma_pago, "01");
});

test("parseFacturaCompraTexto: e-NCF, cédula, fecha con guiones y transferencia", () => {
  const texto = `Proveedor Informal Juan Perez
Cedula: 402-1234567-8
e-NCF: E310000000123
Fecha de emision: 03-06-2026
Monto facturado: 5,250.75
ITBIS facturado: 945.14
TOTAL: 6,195.89
Forma de pago: Transferencia bancaria`;
  const out = parseFacturaCompraTexto(texto);
  assert.equal(out.rnc_cedula, "40212345678");
  assert.equal(out.ncf, "E310000000123");
  assert.equal(out.fecha_comprobante, "20260603");
  assert.equal(out.monto_servicios, 5250.75);
  assert.equal(out.itbis_facturado, 945.14);
  assert.equal(out.forma_pago, "02");
});

test("parseFacturaCompraTexto: sin datos reconocibles devuelve campos vacíos, sin lanzar", () => {
  const out = parseFacturaCompraTexto("texto sin ninguna etiqueta reconocible");
  assert.equal(out.rnc_cedula, "");
  assert.equal(out.ncf, "");
  assert.equal(out.fecha_comprobante, "");
  assert.equal(out.itbis_facturado, 0);
});
