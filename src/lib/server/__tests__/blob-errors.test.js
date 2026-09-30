import { test } from "node:test";
import assert from "node:assert/strict";
import { isBlobConfigError, blobUploadFailureMessage } from "../blob-errors.js";

// The production failure this module exists for: BLOB_STORE_ID pointed at a
// store deleted by a project transfer, so every kind failed with a 404-style
// "Access denied, please provide a valid token for this resource" from inside
// put(). It was unhandled, so the client saw a non-JSON 500 and fell back to a
// bare "Failed to upload cover photo" with nothing to act on.
test("a revoked or orphaned store token is treated as a misconfiguration", () => {
  const err = new Error(
    "Vercel Blob: Access denied, please provide a valid token for this resource."
  );
  assert.equal(isBlobConfigError(err), true);
});

test("other store-not-found and auth wordings are caught", () => {
  assert.equal(isBlobConfigError(new Error("Store not found (404)")), true);
  assert.equal(isBlobConfigError(new Error("Unauthorized")), true);
  assert.equal(isBlobConfigError(new Error("Forbidden")), true);
});

test("a transient storage outage is not blamed on configuration", () => {
  assert.equal(isBlobConfigError(new Error("socket hang up")), false);
  assert.equal(isBlobConfigError(new Error("ETIMEDOUT")), false);
});

test("the misconfiguration message points at support, not at retrying", () => {
  const message = blobUploadFailureMessage(
    new Error("Vercel Blob: Access denied, please provide a valid token for this resource.")
  );
  assert.equal(message, "File storage is not configured. Please contact support.");
});

test("a transient failure stays retryable", () => {
  assert.equal(
    blobUploadFailureMessage(new Error("socket hang up")),
    "File storage is unavailable right now. Please try again."
  );
});

test("neither message leaks the raw storage error", () => {
  const secretish = new Error("Vercel Blob: Access denied for store_FmjkBsUQdzHqdU7A");
  assert.equal(blobUploadFailureMessage(secretish).includes("store_Fmj"), false);
});

// A thrown value that is not an Error must not crash classification.
test("non-Error throws degrade to the transient message", () => {
  assert.equal(isBlobConfigError(undefined), false);
  assert.equal(isBlobConfigError(null), false);
  assert.equal(blobUploadFailureMessage("boom"), "File storage is unavailable right now. Please try again.");
});
