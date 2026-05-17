import assert from "node:assert/strict";
import { test } from "node:test";
import { validateCotizacionDgiiResubmit } from "./cotizacion.service";

test("validateCotizacionDgiiResubmit: primer envío permitido", () => {
  const r = validateCotizacionDgiiResubmit({ dgiiStatus: null, dgiiResponse: null });
  assert.equal(r.allowed, true);
});

test("validateCotizacionDgiiResubmit: rechazo por secuencia permite reenviar", () => {
  const raw = JSON.stringify({
    mensajes: [{ valor: "Este número de secuencia ya ha sido utilizado.", codigo: 1209 }],
  });
  const r = validateCotizacionDgiiResubmit({ dgiiStatus: "rejected", dgiiResponse: raw });
  assert.equal(r.allowed, true);
});

test("validateCotizacionDgiiResubmit: rechazo por validación XML bloquea reenvío", () => {
  const raw = JSON.stringify({
    mensajes: [{ valor: "El campo MontoTotal es inválido.", codigo: 100 }],
  });
  const r = validateCotizacionDgiiResubmit({ dgiiStatus: "rejected", dgiiResponse: raw });
  assert.equal(r.allowed, false);
  if (!r.allowed) assert.equal(r.code, "DGII_REJECT_NOT_SEQUENCE");
});

test("validateCotizacionDgiiResubmit: aceptado bloquea reenvío", () => {
  const r = validateCotizacionDgiiResubmit({ dgiiStatus: "accepted", dgiiResponse: "{}" });
  assert.equal(r.allowed, false);
  if (!r.allowed) assert.equal(r.code, "DGII_ALREADY_ACCEPTED");
});
