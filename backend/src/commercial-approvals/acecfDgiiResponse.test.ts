import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseAcecfDgiiValidationResponse } from "./acecfDgiiResponse";

describe("parseAcecfDgiiValidationResponse (Paso 3 DGII)", () => {
  it("reconoce OK textual", () => {
    const r = parseAcecfDgiiValidationResponse("OK", 200);
    assert.equal(r.validation, "OK");
    assert.equal(r.accepted, true);
  });

  it("reconoce Incorrecto", () => {
    const r = parseAcecfDgiiValidationResponse("Incorrecto", 200);
    assert.equal(r.validation, "INCORRECTO");
    assert.equal(r.accepted, false);
  });

  it("reconoce Error", () => {
    const r = parseAcecfDgiiValidationResponse('{"estado":"Error","mensaje":"eNCF no encontrado"}', 200);
    assert.equal(r.validation, "ERROR");
    assert.equal(r.accepted, false);
  });

  it("reconoce codigo 1 como OK (compatibilidad)", () => {
    const r = parseAcecfDgiiValidationResponse('{"codigo":1,"estado":"Aceptado"}', 200);
    assert.equal(r.validation, "OK");
    assert.equal(r.accepted, true);
  });
});
