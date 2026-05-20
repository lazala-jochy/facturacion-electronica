import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEcfXml } from "../services/xmlBuilder";
import type { EcfPayload } from "../services/validation";
import { parseRepresentacionImpresaData } from "./ecfRepresentacionImpresaData";

const basePayload = (): EcfPayload => ({
  ecfNumber: "E310000000001",
  issueDate: new Date("2024-06-15T12:00:00.000Z"),
  issuer: {
    rnc: "131880738",
    name: "ACME SRL",
    address: "Av. Principal 1",
    phone: "809-555-0000",
    email: "a@acme.com",
  },
  buyer: {
    name: "Cliente Demo",
    rncCedula: "40212345678",
    address: "Calle 2",
    contact: "Pedro",
  },
  items: [
    {
      itemNumber: 1,
      description: "Servicio consultoría",
      quantity: 2,
      unit: "UNIDAD",
      unitPrice: 100,
      totalValue: 200,
    },
  ],
  subtotal: 200,
  itbis: 36,
  total: 236,
});

test("parseRepresentacionImpresaData: encabezado tipo 31 y totales", () => {
  const xml = buildEcfXml(basePayload());
  const data = parseRepresentacionImpresaData(xml, "31");
  assert.equal(data.tipoEcf, "31");
  assert.match(data.tipoLabel, /Crédito Fiscal Electrónica/);
  assert.equal(data.encf, "E310000000001");
  assert.equal(data.fechaVencimientoSecuencia, "31-12-2028");
  assert.equal(data.emisor.rnc, "131880738");
  assert.match(data.emisor.fechaEmision, /^\d{2}-\d{2}-\d{4}$/);
  assert.equal(data.comprador.rncCedula, "40212345678");
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0]?.unidadLabel, "Unidad");
  assert.equal(data.totales.total, "236.00");
  assert.equal(data.totales.totalItbis, "36.00");
  assert.equal(data.items[0]?.itbisLinea, "36.00");
});

test("parseRepresentacionImpresaData: ITBIS por línea si no viene ITBISItem en XML", () => {
  const xml = `<?xml version="1.0"?><ECF>
  <Encabezado>
    <IdDoc><TipoeCF>31</TipoeCF><eNCF>E310000000101</eNCF></IdDoc>
    <Totales>
      <MontoGravadoTotal>10.00</MontoGravadoTotal>
      <ITBIS1>18</ITBIS1>
      <TotalITBIS>1.80</TotalITBIS>
      <MontoTotal>11.80</MontoTotal>
    </Totales>
  </Encabezado>
  <DetallesItems>
    <Item>
      <IndicadorFacturacion>1</IndicadorFacturacion>
      <NombreItem>camillas</NombreItem>
      <CantidadItem>1.00</CantidadItem>
      <PrecioUnitarioItem>10.00</PrecioUnitarioItem>
      <MontoItem>10.00</MontoItem>
    </Item>
  </DetallesItems>
</ECF>`;
  const data = parseRepresentacionImpresaData(xml, "31");
  assert.equal(data.items[0]?.itbisLinea, "1.80");
});

test("parseRepresentacionImpresaData: tipo 32 sin fecha vencimiento secuencia", () => {
  const p = { ...basePayload(), ecfNumber: "E320000000011" };
  p.ecfTipo = "32";
  const xml = buildEcfXml({ ...p, ecfTipo: "32" });
  const data = parseRepresentacionImpresaData(xml, "32");
  assert.equal(data.tipoEcf, "32");
  assert.equal(data.fechaVencimientoSecuencia, "");
  assert.equal(data.esConsumoMenor250, true);
});

test("parseRepresentacionImpresaData: nota crédito con referencia", () => {
  const p = {
    ...basePayload(),
    ecfNumber: "E340000000016",
    ecfTipo: "34",
    referenceEncf: "E310000000001",
    total: 0,
    subtotal: 0,
    itbis: 0,
    items: [
      {
        itemNumber: 1,
        description: "Corrección",
        quantity: 1,
        unit: "UN",
        unitPrice: 0,
        totalValue: 0,
      },
    ],
  };
  const xml = buildEcfXml(p);
  const data = parseRepresentacionImpresaData(xml, "34");
  assert.equal(data.ncfModificado, "E310000000001");
  assert.ok(data.codigoModificacionLabel.length > 0);
  assert.equal(data.fechaVencimientoSecuencia, "");
});
