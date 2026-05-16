import assert from "node:assert/strict";
import { test } from "node:test";
import { mapDgiiJsonEstadoToCotizacionEstado, mapDgiiRawBodyToCotizacionEstado } from "./dgiiEstadoRecepcion";

test("JSON consulta DGII: Rechazado + codigo 2 → rejected", () => {
  const raw = JSON.stringify({
    trackId: "6c0dab3d-43d7-4c0e-ad77-1b578837e5b3",
    codigo: "2",
    estado: "Rechazado",
    rnc: "04900920846",
    encf: "E310000000001",
    secuenciaUtilizada: false,
    mensajes: [{ valor: "error xml", codigo: 3 }],
  });
  assert.equal(mapDgiiRawBodyToCotizacionEstado(raw), "rejected");
});

test("JSON: codigo 1 string → accepted", () => {
  const p = { codigo: "1", estado: "Aceptado" };
  assert.equal(mapDgiiJsonEstadoToCotizacionEstado(p as Record<string, unknown>), "accepted");
});

test("JSON: estado en proceso → pending", () => {
  const p = { estado: "En proceso" };
  assert.equal(mapDgiiJsonEstadoToCotizacionEstado(p as Record<string, unknown>), "pending");
});
