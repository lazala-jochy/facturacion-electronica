import assert from "node:assert/strict";
import { test } from "node:test";
import {
  build606Txt,
  build607Txt,
  dgiiTipoIdentificacion,
  parsePeriodoParam,
} from "./dgiiFormato606607";

test("dgiiTipoIdentificacion: RNC y cédula", () => {
  assert.deepEqual(dgiiTipoIdentificacion("131880738"), {
    rncCedula: "131880738",
    tipo: "1",
  });
  assert.deepEqual(dgiiTipoIdentificacion("40212345678"), {
    rncCedula: "40212345678",
    tipo: "2",
  });
  assert.deepEqual(dgiiTipoIdentificacion(""), { rncCedula: "", tipo: "3" });
});

test("build607Txt: encabezado y detalle", () => {
  const periodo = parsePeriodoParam("2026-04");
  assert.ok(periodo);
  const txt = build607Txt("131880738", periodo, [
    {
      rncCedula: "40212345678",
      tipoIdentificacion: "2",
      ncf: "E310000000001",
      tipoIngreso: "01",
      fechaComprobante: "20260415",
      montoFacturado: 200,
      itbisFacturado: 36,
      montoCredito: 236,
    },
  ]);
  const lines = txt.trim().split("\n");
  assert.equal(lines[0], "607|131880738|202604|1");
  assert.match(lines[1] ?? "", /^40212345678\|2\|E310000000001\|/);
});

test("build606Txt: encabezado vacío", () => {
  const periodo = parsePeriodoParam("2026-03");
  assert.ok(periodo);
  const txt = build606Txt("131880738", periodo, []);
  assert.equal(txt.trim(), "606|131880738|202603|0");
});

test("build606Txt: detalle con 23 columnas plantilla DGII", () => {
  const periodo = parsePeriodoParam("2026-05");
  assert.ok(periodo);
  const txt = build606Txt("131880738", periodo, [
    {
      rncCedula: "101010101",
      tipoIdentificacion: "1",
      tipoBienesServicios: "02",
      ncf: "E410000000001",
      fechaComprobante: "20260510",
      fechaPago: "20260515",
      montoServicios: 1000,
      montoBienes: 500,
      montoFacturado: 1500,
      itbisFacturado: 270,
      itbisRetenido: 0,
      formaPago: "04",
    },
  ]);
  const lines = txt.trim().split("\n");
  assert.equal(lines.length, 2);
  const parts = lines[1].split("|");
  assert.equal(parts.length, 23);
  assert.equal(parts[0], "101010101");
  assert.equal(parts[2], "02");
  assert.equal(parts[3], "E410000000001");
  assert.equal(parts[9], "1500.00");
  assert.equal(parts[22], "04");
});
