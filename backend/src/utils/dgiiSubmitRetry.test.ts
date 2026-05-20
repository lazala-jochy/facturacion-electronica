import test from "node:test";
import assert from "node:assert/strict";
import {
  computeNextDgiiSubmitRetryAt,
  isRetryableDgiiSubmitError,
  DGII_SUBMIT_RETRY_DELAYS_MS,
} from "./dgiiSubmitRetry";

test("isRetryableDgiiSubmitError: red y 5xx en recepción", () => {
  assert.equal(isRetryableDgiiSubmitError("NETWORK"), true);
  assert.equal(isRetryableDgiiSubmitError("RECEPTION_FAILED", 503), true);
  assert.equal(isRetryableDgiiSubmitError("RECEPTION_FAILED", 429), true);
  assert.equal(isRetryableDgiiSubmitError("RECEPTION_FAILED", 400), false);
  assert.equal(isRetryableDgiiSubmitError("MISSING_CREDENTIALS"), false);
});

test("computeNextDgiiSubmitRetryAt usa backoff escalonado", () => {
  const before = Date.now();
  const at1 = computeNextDgiiSubmitRetryAt(1);
  const at7 = computeNextDgiiSubmitRetryAt(99);
  assert.ok(at1.getTime() - before >= DGII_SUBMIT_RETRY_DELAYS_MS[0] - 50);
  assert.ok(
    at7.getTime() - before >= DGII_SUBMIT_RETRY_DELAYS_MS[DGII_SUBMIT_RETRY_DELAYS_MS.length - 1] - 50,
  );
});
