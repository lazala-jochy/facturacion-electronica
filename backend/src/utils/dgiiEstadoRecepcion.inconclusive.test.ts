import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isInconclusiveDgiiReceptionBody,
  mapDgiiRawBodyToCotizacionEstado,
} from "./dgiiEstadoRecepcion";
import { summarizeDgiiResponse } from "./dgiiRejection";

test("acuse recepción trackId-only es inconcluso, no rechazo", () => {
  const raw = JSON.stringify({
    trackId: "a22a6b2b-6351-402e-9124-182761d3cc21",
    error: null,
    mensaje: null,
  });
  assert.equal(isInconclusiveDgiiReceptionBody(raw), true);
  assert.equal(mapDgiiRawBodyToCotizacionEstado(raw), null);
  assert.match(summarizeDgiiResponse(raw), /consultando estado/i);
});
