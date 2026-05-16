import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEcfXml, resolvePlantillaEcfTipo } from "./xmlBuilder";
import { refinePayloadForEcfTipo } from "./ecfTipoHandlers";
import { validateEcfPayload } from "./validation";
import type { EcfPayload } from "./validation";

test("XML e-CF DGII: raíz ECF, Totales con ITBIS1=18, DetallesItems, FechaHoraFirma", () => {
  const issueDate = new Date("2024-06-15T12:00:00.000Z");
  const p: EcfPayload = {
    ecfNumber: "E310000000001",
    issueDate,
    issuer: {
      rnc: "131880738",
      name: "ACME",
      address: "Calle 1",
      phone: "809-555-0000",
      email: "a@b.com",
    },
    buyer: {
      name: "Cliente",
      rncCedula: "40212345678",
      address: null,
      contact: null,
    },
    items: [
      {
        itemNumber: 1,
        description: "Item",
        quantity: 1,
        unit: "43",
        unitPrice: 100,
        totalValue: 100,
      },
    ],
    subtotal: 100,
    itbis: 18,
    total: 118,
  };
  const xml = buildEcfXml(p);
  assert.match(xml, /^<\?xml /);
  assert.match(xml, /<ECF>/);
  assert.match(xml, /<eNCF>E310000000001<\/eNCF>/);
  assert.match(
    xml,
    /<eNCF>E310000000001<\/eNCF>\s*<FechaVencimientoSecuencia>/,
    "IdDoc tipo 31: FechaVencimientoSecuencia inmediatamente tras eNCF (muestra DGII válida)",
  );
  assert.doesNotMatch(xml, /<IndicadorEnvioDiferido>/);
  assert.match(xml, /<FechaEmision>15-06-2024<\/FechaEmision>/);
  assert.match(xml, /<DetallesItems>/);
  assert.match(xml, /<UnidadMedida>43<\/UnidadMedida>/);
  assert.match(xml, /<ITBIS1>18<\/ITBIS1>/);
  assert.match(xml, /<FechaHoraFirma>\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}<\/FechaHoraFirma>/);
  assert.doesNotMatch(xml, /NCFModificado/);
  assert.doesNotMatch(xml, /<eCF/);
  assert.doesNotMatch(xml, /<Detalle>/);
  assert.match(xml, /<MunicipioComprador>010101<\/MunicipioComprador>/);
  assert.match(xml, /<ProvinciaComprador>010000<\/ProvinciaComprador>/);
});

test("Comprador XSD: ContactoComprador antes que DireccionComprador; Municipio/Provincia al final", () => {
  const issueDate = new Date("2024-06-15T12:00:00.000Z");
  const p: EcfPayload = {
    ecfNumber: "E310000000002",
    issueDate,
    issuer: {
      rnc: "131880738",
      name: "ACME",
      address: "Calle 1",
      phone: null,
      email: null,
    },
    buyer: {
      name: "Cliente",
      rncCedula: "40212345678",
      address: "Av. Larga 1",
      contact: "Pedro Pérez",
    },
    items: [
      {
        itemNumber: 1,
        description: "Item",
        quantity: 1,
        unit: "43",
        unitPrice: 1,
        totalValue: 1,
      },
    ],
    subtotal: 1,
    itbis: 0.18,
    total: 1.18,
  };
  const xml = buildEcfXml(p);
  assert.match(
    xml,
    /<Comprador>[\s\S]*?<RazonSocialComprador>[\s\S]*?<\/RazonSocialComprador>\s*<ContactoComprador>Pedro Pérez<\/ContactoComprador>\s*<DireccionComprador>Av\. Larga 1<\/DireccionComprador>[\s\S]*?<MunicipioComprador>/,
  );
});

test("IdDoc e-CF 32 XSD: sin FechaVencimientoSecuencia ni IndicadorServicioTodoIncluido si no es todo incluido; TipoPago tras TipoIngresos", () => {
  const issueDate = new Date("2026-05-15T12:00:00.000Z");
  const p: EcfPayload = {
    ecfNumber: "E320000000001",
    ecfTipo: "32",
    issueDate,
    issuer: {
      rnc: "04900920846",
      name: "Emisor",
      address: "Calle",
      phone: null,
      email: null,
    },
    buyer: {
      name: "Cliente",
      rncCedula: "00000000000",
      address: null,
      contact: null,
    },
    items: [
      {
        itemNumber: 1,
        description: "Producto",
        quantity: 1,
        unit: "43",
        unitPrice: 300_000,
        totalValue: 300_000,
      },
    ],
    subtotal: 300_000,
    itbis: 54_000,
    total: 354_000,
  };
  const xml = buildEcfXml(p);
  assert.match(
    xml,
    /<eNCF>E320000000001<\/eNCF>\s*<IndicadorEnvioDiferido>1<\/IndicadorEnvioDiferido>\s*<IndicadorMontoGravado>0<\/IndicadorMontoGravado>\s*<TipoIngresos>01<\/TipoIngresos>\s*<TipoPago>/,
  );
  assert.doesNotMatch(xml, /<TipoIngresos>01<\/TipoIngresos>[\s\S]*<FechaVencimientoSecuencia>/);
  assert.doesNotMatch(xml, /<IndicadorServicioTodoIncluido>/);
});

test("XML e-CF 33: NCFModificado en InformacionReferencia, no en IdDoc", () => {
  const issueDate = new Date("2024-06-15T12:00:00.000Z");
  const p: EcfPayload = {
    ecfNumber: "E330000000001",
    issueDate,
    issuer: {
      rnc: "131880738",
      name: "ACME",
      address: "Calle 1",
      phone: null,
      email: null,
    },
    buyer: {
      name: "Cliente",
      rncCedula: "40212345678",
      address: null,
      contact: null,
    },
    items: [
      {
        itemNumber: 1,
        description: "Ajuste",
        quantity: 1,
        unit: "43",
        unitPrice: 50,
        totalValue: 50,
      },
    ],
    subtotal: 50,
    itbis: 9,
    total: 59,
    ecfTipo: "33",
    referenceEncf: "E320000000006",
  };
  const xml = buildEcfXml(p);
  assert.match(
    xml,
    /<eNCF>E330000000001<\/eNCF>\s*<FechaVencimientoSecuencia>[\s\S]*?<IndicadorMontoGravado>0<\/IndicadorMontoGravado>\s*<TipoIngresos>/,
    "IdDoc 33: IndicadorMontoGravado requerido con totales gravados",
  );
  const idDocInner = xml.match(/<IdDoc>([\s\S]*?)<\/IdDoc>/)?.[1] ?? "";
  assert.doesNotMatch(idDocInner, /NCFModificado/, "IdDoc 33 no debe incluir NCFModificado");
  assert.match(
    xml,
    /<DetallesItems>[\s\S]*<\/DetallesItems>\s*<InformacionReferencia>\s*<NCFModificado>E320000000006<\/NCFModificado>\s*<FechaNCFModificado>15-06-2024<\/FechaNCFModificado>\s*<CodigoModificacion>3<\/CodigoModificacion>\s*<\/InformacionReferencia>/,
  );
});

test("XML e-CF 34 gravado: IndicadorMontoGravado + TipoIngresos, sin TablaFormasPago", () => {
  const issueDate = new Date("2024-06-15T12:00:00.000Z");
  const p: EcfPayload = {
    ecfNumber: "E340000000001",
    issueDate,
    issuer: {
      rnc: "131880738",
      name: "ACME",
      address: "Calle 1",
      phone: null,
      email: null,
    },
    buyer: {
      name: "Cliente",
      rncCedula: "40212345678",
      address: null,
      contact: null,
    },
    items: [
      {
        itemNumber: 1,
        description: "Ajuste",
        quantity: 1,
        unit: "43",
        unitPrice: 50,
        totalValue: 50,
      },
    ],
    subtotal: 50,
    itbis: 9,
    total: 59,
    ecfTipo: "34",
    referenceEncf: "E310000000999",
  };
  const xml = buildEcfXml(p);
  assert.match(
    xml,
    /<eNCF>E340000000001<\/eNCF>\s*<IndicadorNotaCredito>0<\/IndicadorNotaCredito>\s*<IndicadorMontoGravado>0<\/IndicadorMontoGravado>\s*<TipoIngresos>01<\/TipoIngresos>\s*<TipoPago>1<\/TipoPago>/,
  );
  assert.doesNotMatch(xml, /<TablaFormasPago>/);
  assert.match(xml, /<MontoGravadoTotal>/);
  assert.match(
    xml,
    /<InformacionReferencia>[\s\S]*<CodigoModificacion>2<\/CodigoModificacion>/,
  );
});

test("XML e-CF 34 sin ITBIS: perfil E340000000016 (IndicadorNotaCredito 1, MontoNoFacturable)", () => {
  const issueDate = new Date("2024-06-15T12:00:00.000Z");
  const p: EcfPayload = {
    ecfNumber: "E340000000016",
    issueDate,
    issuer: {
      rnc: "131880738",
      name: "ACME",
      address: "Calle 1",
      phone: null,
      email: null,
    },
    buyer: {
      name: "Cliente",
      rncCedula: "40212345678",
      address: null,
      contact: null,
    },
    items: [
      {
        itemNumber: 1,
        description: "Servicio",
        quantity: 1,
        unit: "43",
        unitPrice: 1,
        totalValue: 1,
      },
    ],
    subtotal: 1,
    itbis: 0,
    total: 1,
    ecfTipo: "34",
    referenceEncf: "E410000000010",
  };
  const xml = buildEcfXml(p);
  assert.match(xml, /<IndicadorNotaCredito>1<\/IndicadorNotaCredito>\s*<TipoPago>1<\/TipoPago>/);
  assert.doesNotMatch(xml, /<IndicadorMontoGravado>/);
  assert.doesNotMatch(xml, /<TipoIngresos>/);
  assert.match(xml, /<MontoNoFacturable>1\.00<\/MontoNoFacturable>/);
  assert.match(xml, /<IndicadorFacturacion>0<\/IndicadorFacturacion>/);
});

test("XML e-CF 41: IdDoc sin TipoIngresos, retenciones y Comprador mínimo", () => {
  const issueDate = new Date("2024-06-15T12:00:00.000Z");
  const p: EcfPayload = {
    ecfNumber: "E410000000007",
    ecfTipo: "41",
    issueDate,
    issuer: {
      rnc: "131880738",
      name: "ACME",
      address: "Calle 1",
      phone: null,
      email: null,
    },
    buyer: {
      name: "Proveedor SA",
      rncCedula: "533445861",
      address: "Calle 2",
      contact: "Ana",
    },
    items: [
      {
        itemNumber: 1,
        description: "Servicio profesional",
        quantity: 1,
        unit: "43",
        unitPrice: 1000,
        totalValue: 1000,
      },
    ],
    subtotal: 1000,
    itbis: 180,
    total: 1180,
  };
  const xml = buildEcfXml(p);
  assert.match(
    xml,
    /<FechaVencimientoSecuencia>[\s\S]*<IndicadorMontoGravado>0<\/IndicadorMontoGravado>\s*<TipoPago>1<\/TipoPago>\s*<TablaFormasPago>/,
  );
  assert.doesNotMatch(xml, /<TipoIngresos>/);
  assert.match(xml, /<TotalITBISRetenido>/);
  assert.match(xml, /<TotalISRRetencion>/);
  assert.match(
    xml,
    /<IndicadorFacturacion>1<\/IndicadorFacturacion>\s*<Retencion>\s*<IndicadorAgenteRetencionoPercepcion>1<\/IndicadorAgenteRetencionoPercepcion>/,
  );
  assert.match(xml, /<RNCComprador>533445861<\/RNCComprador>/);
  assert.doesNotMatch(xml, /<MunicipioComprador>/);
});

test("Plantilla 43: alineada a E430000000011 (IdDoc, totales exentos, ítems)", () => {
  const issueDate = new Date("2024-06-15T12:00:00.000Z");
  const p: EcfPayload = {
    ecfNumber: "E430000000011",
    ecfTipo: "43",
    issueDate,
    issuer: {
      rnc: "131880738",
      name: "ACME",
      address: "Calle 1",
      phone: null,
      email: null,
    },
    buyer: {
      name: "X",
      rncCedula: "00000000000",
      address: null,
      contact: null,
    },
    items: [
      {
        itemNumber: 1,
        description: "Gasto personal en comida (kiosko)",
        quantity: 15,
        unit: "43",
        unitPrice: 330,
        totalValue: 4950,
      },
      {
        itemNumber: 2,
        description: "Gasto personal en comida (kiosko) segunda semana",
        quantity: 12,
        unit: "43",
        unitPrice: 350,
        totalValue: 4200,
      },
    ],
    subtotal: 9150,
    itbis: 0,
    total: 9150,
  };
  const xml = buildEcfXml(p);
  assert.match(
    xml,
    /<IdDoc>\s*<TipoeCF>43<\/TipoeCF>\s*<eNCF>E430000000011<\/eNCF>\s*<FechaVencimientoSecuencia>[\s\S]*?<\/IdDoc>/,
  );
  assert.doesNotMatch(xml, /<TipoPago>/);
  assert.doesNotMatch(xml, /<Comprador>/);
  assert.doesNotMatch(xml, /<IndicadorMontoGravado>/);
  assert.doesNotMatch(xml, /<TablaFormasPago>/);
  assert.match(xml, /<MontoExento>9150\.00<\/MontoExento>\s*<MontoTotal>9150\.00<\/MontoTotal>/);
  assert.match(
    xml,
    /<IndicadorFacturacion>4<\/IndicadorFacturacion>\s*<NombreItem>Gasto personal en comida \(kiosko\)<\/NombreItem>\s*<IndicadorBienoServicio>2<\/IndicadorBienoServicio>/,
  );
});

test("Plantilla 44: alineada a E440000000010 (IdDoc, totales exentos, ítems fact. 4)", () => {
  const issueDate = new Date("2024-06-15T12:00:00.000Z");
  const p: EcfPayload = {
    ecfNumber: "E440000000010",
    ecfTipo: "44",
    issueDate,
    issuer: {
      rnc: "131880738",
      name: "ACME",
      address: "Calle 1",
      phone: null,
      email: null,
    },
    buyer: {
      name: "Cliente RE",
      rncCedula: "131880681",
      address: "Calle comprador",
      contact: "Contacto",
    },
    items: [
      {
        itemNumber: 1,
        description: "ZAPATOS",
        quantity: 40,
        unit: "6",
        unitPrice: 350,
        totalValue: 13500,
      },
    ],
    subtotal: 13500,
    itbis: 0,
    total: 13500,
  };
  const xml = buildEcfXml(p);
  assert.match(
    xml,
    /<FechaVencimientoSecuencia>[\s\S]*<TipoIngresos>01<\/TipoIngresos>\s*<TipoPago>1<\/TipoPago>\s*<TablaFormasPago>/,
  );
  assert.doesNotMatch(xml, /<IndicadorMontoGravado>/);
  assert.doesNotMatch(xml, /<MontoGravadoTotal>/);
  assert.match(
    xml,
    /<MontoExento>13500\.00<\/MontoExento>\s*<MontoTotal>13500\.00<\/MontoTotal>\s*<MontoPeriodo>13500\.00<\/MontoPeriodo>\s*<ValorPagar>13500\.00<\/ValorPagar>/,
  );
  assert.match(
    xml,
    /<IndicadorFacturacion>4<\/IndicadorFacturacion>\s*<NombreItem>ZAPATOS<\/NombreItem>/,
  );
  assert.match(xml, /<Comprador>/);
});

test("Plantilla 45: alineada a E450000000002 (dual ITBIS, ValorPagar, ítems fact. 1|2)", () => {
  const issueDate = new Date("2024-06-15T12:00:00.000Z");
  const p: EcfPayload = {
    ecfNumber: "E450000000002",
    ecfTipo: "45",
    issueDate,
    issuer: {
      rnc: "131880738",
      name: "ACME",
      address: "Calle 1",
      phone: null,
      email: null,
    },
    buyer: {
      name: "Cliente Gov",
      rncCedula: "131880681",
      address: "Calle comprador",
    },
    items: [
      {
        itemNumber: 1,
        description: "BLOCK",
        quantity: 100,
        unit: "23",
        unitPrice: 450,
        totalValue: 45000,
        indicadorFacturacion: "1",
      },
      {
        itemNumber: 2,
        description: "CEMENTO GRIS",
        quantity: 400,
        unit: "23",
        unitPrice: 250,
        totalValue: 100000,
        indicadorFacturacion: "2",
      },
    ],
    subtotal: 145000,
    itbis: 24100,
    total: 169100,
  };
  const xml = buildEcfXml(p);
  assert.match(xml, /<IndicadorMontoGravado>0<\/IndicadorMontoGravado>/);
  assert.match(
    xml,
    /<MontoGravadoI1>45000\.00<\/MontoGravadoI1>\s*<MontoGravadoI2>100000\.00<\/MontoGravadoI2>\s*<ITBIS1>18<\/ITBIS1>\s*<ITBIS2>16<\/ITBIS2>/,
  );
  assert.match(
    xml,
    /<TotalITBIS1>8100\.00<\/TotalITBIS1>\s*<TotalITBIS2>16000\.00<\/TotalITBIS2>/,
  );
  assert.match(xml, /<ValorPagar>169100\.00<\/ValorPagar>/);
  assert.match(
    xml,
    /<IndicadorFacturacion>1<\/IndicadorFacturacion>\s*<NombreItem>BLOCK<\/NombreItem>/,
  );
  assert.match(
    xml,
    /<IndicadorFacturacion>2<\/IndicadorFacturacion>\s*<NombreItem>CEMENTO GRIS<\/NombreItem>/,
  );
  assert.match(xml, /<PrecioUnitarioItem>450\.0000<\/PrecioUnitarioItem>/);
});

test("Plantilla 46: alineada a E460000000001 (crédito, I3/ITBIS 0, ítems fact. 3)", () => {
  const issueDate = new Date("2020-04-01T12:00:00.000Z");
  const p: EcfPayload = {
    ecfNumber: "E460000000001",
    ecfTipo: "46",
    issueDate,
    issuer: {
      rnc: "131880738",
      name: "ACME",
      address: "Calle 1",
      phone: null,
      email: null,
    },
    buyer: {
      name: "ZONA FRANCA LOI",
      rncCedula: "131880681",
      address: "ZONA HAINA",
    },
    items: [
      {
        itemNumber: 1,
        description: "AGUACATE CRIOLLO",
        quantity: 100,
        unit: "43",
        unitPrice: 18000,
        totalValue: 1800000,
        codigoItem: "123456",
      },
    ],
    subtotal: 1800000,
    itbis: 0,
    total: 1800000,
    fechaLimitePago: "06-05-2020",
    terminoPago: "1 mes",
  };
  const xml = buildEcfXml(p);
  assert.doesNotMatch(xml, /<IndicadorMontoGravado>/);
  assert.match(
    xml,
    /<TipoIngresos>01<\/TipoIngresos>\s*<TipoPago>2<\/TipoPago>\s*<FechaLimitePago>06-05-2020<\/FechaLimitePago>\s*<TerminoPago>1 mes<\/TerminoPago>/,
  );
  assert.match(xml, /<FormaPago>2<\/FormaPago>\s*<MontoPago>1800000\.00<\/MontoPago>/);
  assert.match(
    xml,
    /<MontoGravadoI3>1800000\.00<\/MontoGravadoI3>\s*<ITBIS3>0<\/ITBIS3>\s*<TotalITBIS>0\.00<\/TotalITBIS>\s*<TotalITBIS3>0\.00<\/TotalITBIS3>/,
  );
  assert.doesNotMatch(xml, /<MontoGravadoI1>/);
  assert.doesNotMatch(xml, /<ValorPagar>/);
  assert.match(
    xml,
    /<TablaCodigosItem>[\s\S]*<CodigoItem>123456<\/CodigoItem>[\s\S]*<IndicadorFacturacion>3<\/IndicadorFacturacion>/,
  );
  assert.match(xml, /<PrecioUnitarioItem>18000\.00<\/PrecioUnitarioItem>/);
  assert.match(
    xml,
    /<MontoTotal>1800000\.00<\/MontoTotal>/,
  );
});

test("Plantilla 46: MontoTotal = gravado si la cotización traía ITBIS 18%", () => {
  const issueDate = new Date("2020-04-01T12:00:00.000Z");
  const raw: EcfPayload = {
    ecfNumber: "E460000000002",
    ecfTipo: "46",
    issueDate,
    issuer: {
      rnc: "131880738",
      name: "ACME",
      address: "Calle 1",
    },
    buyer: { name: "Cliente", rncCedula: "131880681" },
    items: [
      {
        itemNumber: 1,
        description: "Producto export",
        quantity: 10,
        unit: "6",
        unitPrice: 100,
        totalValue: 1000,
      },
    ],
    subtotal: 1000,
    itbis: 180,
    total: 1180,
  };
  const refined = refinePayloadForEcfTipo(raw, {
    ecfTipo: "46",
    ecfReferenceNcf: null,
    client: { rncCedula: "131880681" },
  } as Parameters<typeof refinePayloadForEcfTipo>[1]);
  assert.equal(refined.itbis, 0);
  assert.equal(refined.total, 1000);
  const xml = buildEcfXml(refined);
  assert.match(
    xml,
    /<MontoGravadoTotal>1000\.00<\/MontoGravadoTotal>[\s\S]*<MontoTotal>1000\.00<\/MontoTotal>/,
  );
  assert.match(xml, /<MontoPago>1000\.00<\/MontoPago>/);
  assert.doesNotMatch(xml, /<MontoTotal>1180\.00<\/MontoTotal>/);
});

test("resolvePlantillaEcfTipo prioriza tipo de comprobante fiscal sobre prefijo e-NCF", () => {
  assert.equal(
    resolvePlantillaEcfTipo({
      ecfTipo: "32",
      ecfNumber: "E310000000099",
    }),
    "32",
  );
});

test("validateEcfPayload rechaza tipo comprobante distinto al prefijo del e-NCF", () => {
  const issueDate = new Date("2024-06-15T12:00:00.000Z");
  const p: EcfPayload = {
    ecfTipo: "31",
    ecfNumber: "E320000000001",
    issueDate,
    issuer: {
      rnc: "131880738",
      name: "ACME",
      address: "Calle 1",
      phone: null,
      email: null,
    },
    buyer: {
      name: "Cliente",
      rncCedula: "40212345678",
      address: null,
      contact: null,
    },
    items: [
      {
        itemNumber: 1,
        description: "Item",
        quantity: 1,
        unit: "43",
        unitPrice: 100,
        totalValue: 100,
      },
    ],
    subtotal: 100,
    itbis: 18,
    total: 118,
  };
  const v = validateEcfPayload(p);
  assert.equal(v.valid, false);
  assert.ok(v.errors.some((e) => e.includes("tipo de comprobante fiscal")));
});
