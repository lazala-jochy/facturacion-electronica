import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatDgiiResponseFullMessage,
  isDgiiSequenceRejection,
  summarizeDgiiResponse,
} from "./dgiiRejection";

test("isDgiiSequenceRejection: texto secuencia en mensajes", () => {
  assert.equal(
    isDgiiSequenceRejection(
      JSON.stringify({
        mensajes: [{ valor: "El NCF tiene una secuencia ya utilizada.", codigo: 1 }],
      }),
    ),
    true,
  );
});

test("isDgiiSequenceRejection: código 1209 arriba", () => {
  assert.equal(isDgiiSequenceRejection(JSON.stringify({ codigo: "1209" })), true);
});

test("isDgiiSequenceRejection: mensaje DGII secuencia ya utilizado (1209)", () => {
  const raw = JSON.stringify({
    trackId: "8f06e604-8bd9-467a-9f63-47bfaf171728",
    codigo: "2",
    estado: "Rechazado",
    encf: "E310000000001",
    secuenciaUtilizada: false,
    mensajes: [{ valor: "Este número de secuencia ya ha sido utilizado.", codigo: 1209 }],
  });
  assert.equal(isDgiiSequenceRejection(raw), true);
});

test("isDgiiSequenceRejection: error validación XML no es secuencia aunque venga secuenciaUtilizada", () => {
  const body = {
    trackId: "7576546d-09de-49d8-87f8-b0816bcaf2b2",
    codigo: "2",
    estado: "Rechazado",
    secuenciaUtilizada: true,
    mensajes: [
      {
        valor:
          "El campo IndicadorServicioTodoIncluido del área IdDoc de la sección Encabezado es 1. Su valor actual no es válido",
        codigo: 0,
      },
    ],
  };
  assert.equal(isDgiiSequenceRejection(JSON.stringify(body)), false);
});

test("summarizeDgiiResponse: concatena mensajes[].valor", () => {
  const s = summarizeDgiiResponse(
    JSON.stringify({
      mensajes: [{ valor: "Uno", codigo: 0 }, { valor: "Dos", codigo: 0 }],
    }),
    200,
  );
  assert.match(s, /Uno/);
  assert.match(s, /Dos/);
});

test("formatDgiiResponseFullMessage: no trunca mensaje largo", () => {
  const long =
    "No se encuentra en una fase válida dentro del proceso de certificación para el emisor.";
  const full = formatDgiiResponseFullMessage(
    JSON.stringify({ estado: "Rechazado", mensajes: [{ valor: long, codigo: 0 }] }),
  );
  assert.equal(full, long);
  const short = summarizeDgiiResponse(
    JSON.stringify({ estado: "Rechazado", mensajes: [{ valor: long, codigo: 0 }] }),
    80,
  );
  assert.ok(short.endsWith("…"));
  assert.ok(short.length < full.length);
});
