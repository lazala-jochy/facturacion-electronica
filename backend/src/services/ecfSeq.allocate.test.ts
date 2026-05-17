import assert from "node:assert/strict";
import { test } from "node:test";
import { nextEcfNcfSeqAfterUsed } from "./ecfSeq.service";
import { parseEncfSequence } from "../utils/ecfTipo";

test("siguiente correlativo tras secuencia usada: 3 → 4", () => {
  const used = parseEncfSequence("E310000000003")!.seq;
  assert.equal(used, 3);
  assert.equal(nextEcfNcfSeqAfterUsed(3, used), 4);
});

test("respeta último en BD mayor que encf rechazado: last 16, encf 3 → 17", () => {
  const used = parseEncfSequence("E310000000003")!.seq;
  assert.equal(nextEcfNcfSeqAfterUsed(16, used), 17);
});

test("rechazo secuencia 21 con cotización en 21 → 22", () => {
  assert.equal(nextEcfNcfSeqAfterUsed(21, 21), 22);
});
