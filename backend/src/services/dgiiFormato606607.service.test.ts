import assert from "node:assert/strict";
import { test } from "node:test";
import type { Cotizacion } from "@prisma/client";
import { cotizacionToLinea607 } from "./dgiiFormato606607.service";

type CotizacionVentas = Cotizacion & {
  client: { name: string; rncCedula: string };
};

const baseXml = (fechaEmisionDdMmYyyy: string, tipoIngresos = "01") => `
<ECF>
  <Encabezado>
    <IdDoc>
      <eNCF>E310000000109</eNCF>
      <TipoIngresos>${tipoIngresos}</TipoIngresos>
    </IdDoc>
    <Emisor>
      <FechaEmision>${fechaEmisionDdMmYyyy}</FechaEmision>
    </Emisor>
  </Encabezado>
</ECF>`;

const mockCotizacion = (overrides: Partial<CotizacionVentas> = {}): CotizacionVentas =>
  ({
    id: 1,
    number: 1,
    clientId: 1,
    companyId: 1,
    ecfTipo: "31",
    ecfNcfSeq: 109,
    ecfReferenceNcf: null,
    paymentMethod: "Efectivo",
    subtotal: 10,
    itbis: 1.8,
    total: 11.8,
    dgiiStatus: "accepted",
    dgiiSubmittedAt: null,
    createdAt: new Date("2026-05-20T12:00:00.000Z"),
    signedXml: baseXml("20-05-2026"),
    client: { name: "Cliente Test", rncCedula: "40212345678" },
    ...overrides,
  }) as CotizacionVentas;

test("cotizacionToLinea607: FechaEmision con día >= 19 se reordena a AAAAMMDD (no se queda en DDMMAAAA)", () => {
  const linea = cotizacionToLinea607(mockCotizacion({ signedXml: baseXml("20-05-2026") }));
  assert.equal(linea.fechaComprobante, "20260520");
});

test("cotizacionToLinea607: FechaEmision con día < 19 también se reordena correctamente", () => {
  const linea = cotizacionToLinea607(mockCotizacion({ signedXml: baseXml("05-05-2026") }));
  assert.equal(linea.fechaComprobante, "20260505");
});

test("cotizacionToLinea607: TipoIngreso sale con 1 solo dígito (exigido por el validador DGII), no '01'", () => {
  const linea = cotizacionToLinea607(mockCotizacion({ signedXml: baseXml("20-05-2026", "01") }));
  assert.equal(linea.tipoIngreso, "1");
  assert.equal(linea.tipoIngreso.length, 1);

  const linea6 = cotizacionToLinea607(mockCotizacion({ signedXml: baseXml("20-05-2026", "06") }));
  assert.equal(linea6.tipoIngreso, "6");
});
