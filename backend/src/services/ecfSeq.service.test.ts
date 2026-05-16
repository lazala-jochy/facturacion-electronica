import assert from "node:assert/strict";
import { test } from "node:test";
import { extractEncfFromDgiiResponse, isDgiiSequenceRejection } from "../utils/dgiiRejection";
import { parseEncfSequence } from "../utils/ecfTipo";

test("parseEncfSequence: E310000000001", () => {
  const p = parseEncfSequence("E310000000001");
  assert.deepEqual(p, { tipo: "31", seq: 1 });
});

test("parseEncfSequence: E310000000016", () => {
  const p = parseEncfSequence("E310000000016");
  assert.deepEqual(p, { tipo: "31", seq: 16 });
});

test("extractEncfFromDgiiResponse: encf en JSON DGII", () => {
  const raw = JSON.stringify({
    trackId: "8f06e604-8bd9-467a-9f63-47bfaf171728",
    codigo: "2",
    estado: "Rechazado",
    encf: "E310000000001",
    mensajes: [{ valor: "Este número de secuencia ya ha sido utilizado.", codigo: 1209 }],
  });
  const p = extractEncfFromDgiiResponse(raw);
  assert.equal(p?.encf, "E310000000001");
  assert.equal(p?.seq, 1);
  assert.equal(p?.tipo, "31");
  assert.equal(isDgiiSequenceRejection(raw), true);
});
