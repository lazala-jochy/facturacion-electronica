import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEncfSequence } from "../utils/ecfTipo";

test("siguiente correlativo tras secuencia usada: 3 → 4", () => {
  const used = parseEncfSequence("E310000000003")!.seq;
  assert.equal(used, 3);
  const lastInDb = 3;
  const next = Math.max(lastInDb, used) + 1;
  assert.equal(next, 4);
});

test("respeta último en BD mayor que encf rechazado: last 16, encf 3 → 17", () => {
  const used = parseEncfSequence("E310000000003")!.seq;
  const lastInDb = 16;
  const next = Math.max(lastInDb, used) + 1;
  assert.equal(next, 17);
});
