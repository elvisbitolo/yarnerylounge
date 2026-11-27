import { test } from "node:test";
import assert from "node:assert/strict";
import { isJitsiEnabled } from "../jitsi.js";

function withDisabled(value, fn) {
  const previous = process.env.JITSI_DISABLED;
  if (value == null) delete process.env.JITSI_DISABLED;
  else process.env.JITSI_DISABLED = value;
  try {
    return fn();
  } finally {
    if (previous == null) delete process.env.JITSI_DISABLED;
    else process.env.JITSI_DISABLED = previous;
  }
}

test("isJitsiEnabled: enabled by default", () => {
  withDisabled(null, () => assert.equal(isJitsiEnabled(), true));
});

test("isJitsiEnabled: explicit truthy values disable lounges", () => {
  for (const value of ["true", "1", "yes"]) {
    withDisabled(value, () => assert.equal(isJitsiEnabled(), false));
  }
});

test("isJitsiEnabled: unrelated values keep lounges enabled", () => {
  withDisabled("false", () => assert.equal(isJitsiEnabled(), true));
  withDisabled("", () => assert.equal(isJitsiEnabled(), true));
});
