import { test } from "node:test";
import assert from "node:assert/strict";
import { httpStatusFor, isTransientErrorCode } from "../http-errors.js";

test("httpStatusFor: passes through valid HTTP integer statuses", () => {
  assert.equal(httpStatusFor(new Error("x")), 500);
  assert.equal(httpStatusFor(Object.assign(new Error("conflict"), { code: 409 })), 409);
  assert.equal(httpStatusFor(Object.assign(new Error("bad"), { code: 400 })), 400);
});

test("httpStatusFor: maps string error codes to HTTP", () => {
  assert.equal(httpStatusFor(Object.assign(new Error("n"), { code: "not-found" })), 404);
  assert.equal(httpStatusFor(Object.assign(new Error("n"), { code: "already-exists" })), 409);
  assert.equal(httpStatusFor(Object.assign(new Error("n"), { code: "permission-denied" })), 403);
  assert.equal(httpStatusFor(Object.assign(new Error("n"), { code: "aborted" })), 403);
  assert.equal(httpStatusFor(Object.assign(new Error("n"), { code: "unauthenticated" })), 401);
  assert.equal(httpStatusFor(Object.assign(new Error("n"), { code: "invalid-argument" })), 400);
  assert.equal(httpStatusFor(Object.assign(new Error("n"), { code: "resource-exhausted" })), 429);
  assert.equal(httpStatusFor(Object.assign(new Error("n"), { code: "unavailable" })), 503);
});

test("httpStatusFor: maps gRPC numeric codes to HTTP and rejects out-of-range", () => {
  assert.equal(httpStatusFor(Object.assign(new Error("n"), { code: 6 })), 409);
  assert.equal(httpStatusFor(Object.assign(new Error("n"), { code: 7 })), 403);
  assert.equal(httpStatusFor(Object.assign(new Error("n"), { code: 16 })), 401);
  assert.equal(httpStatusFor(Object.assign(new Error("n"), { code: 5 })), 404);
  assert.equal(httpStatusFor(Object.assign(new Error("n"), { code: 200 })), 500);
  assert.equal(httpStatusFor(Object.assign(new Error("n"), { code: 13 })), 429);
});

test("httpStatusFor: missing or non-standard code falls back to 500", () => {
  assert.equal(httpStatusFor(new Error("plain")), 500);
  assert.equal(httpStatusFor({ message: "no code" }), 500);
  assert.equal(httpStatusFor(Object.assign(new Error("n"), { code: "random" })), 500);
});

test("isTransientErrorCode: flags empty/unavailable/deadline-exceeded only", () => {
  assert.equal(isTransientErrorCode(new Error("x")), true);
  assert.equal(isTransientErrorCode(Object.assign(new Error("x"), { code: "unavailable" })), true);
  assert.equal(isTransientErrorCode(Object.assign(new Error("x"), { code: "deadline-exceeded" })), true);
  assert.equal(isTransientErrorCode(Object.assign(new Error("x"), { code: "permission-denied" })), false);
  assert.equal(isTransientErrorCode(Object.assign(new Error("x"), { code: "not-found" })), false);
  assert.equal(isTransientErrorCode(Object.assign(new Error("x"), { code: 7 })), false);
});
