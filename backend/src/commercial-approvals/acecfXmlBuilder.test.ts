import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAcecfXml } from "./acecfXmlBuilder";

describe("acecfXmlBuilder (aislado ECF)", () => {
  it("genera raíz ACECF con DetalleAprobacionComercial y Estado 1", () => {
    const { xml, filename } = buildAcecfXml({
      rncEmisor: "04900920846",
      encf: "E320000000012",
      fechaEmision: "15-05-2026",
      montoTotal: "1500.50",
      rncComprador: "131880738",
      estado: "1",
      fechaHoraAprobacionComercial: "15-05-2026 10:00:00",
    });
    assert.match(xml, /<ACECF\b/);
    assert.doesNotMatch(xml, /<ECF[\s>]/);
    assert.doesNotMatch(xml, /<RFCE[\s>]/);
    assert.match(xml, /<DetalleAprobacionComercial>/);
    assert.match(xml, /<Estado>1<\/Estado>/);
    assert.match(xml, /<eNCF>E320000000012<\/eNCF>/);
    assert.doesNotMatch(xml, /<DetalleMotivoRechazo/);
    assert.equal(filename, "131880738E320000000012.xml");
  });

  it("Estado 1 con motivo en Excel lo incluye tal cual", () => {
    const { xml } = buildAcecfXml({
      rncEmisor: "1",
      encf: "E1",
      fechaEmision: "01-01-2026",
      montoTotal: "1",
      rncComprador: "2",
      estado: "1",
      fechaHoraAprobacionComercial: "01-01-2026 00:00:00",
      detalleMotivoRechazo: "texto opcional",
    });
    assert.match(xml, /<DetalleMotivoRechazo>texto opcional<\/DetalleMotivoRechazo>/);
  });

  it("Estado 2 incluye DetalleMotivoRechazo", () => {
    const { xml } = buildAcecfXml({
      rncEmisor: "1",
      encf: "E1",
      fechaEmision: "01-01-2026",
      montoTotal: "1",
      rncComprador: "2",
      estado: "2",
      fechaHoraAprobacionComercial: "01-01-2026 00:00:00",
      detalleMotivoRechazo: "Motivo de prueba",
    });
    assert.match(xml, /<DetalleMotivoRechazo>Motivo de prueba<\/DetalleMotivoRechazo>/);
  });

  it("Estado 2 exige DetalleMotivoRechazo", () => {
    assert.throws(
      () =>
        buildAcecfXml({
          rncEmisor: "1",
          encf: "E1",
          fechaEmision: "01-01-2026",
          montoTotal: "1",
          rncComprador: "2",
          estado: "2",
          fechaHoraAprobacionComercial: "01-01-2026 00:00:00",
        }),
      /DetalleMotivoRechazo/,
    );
  });
});
