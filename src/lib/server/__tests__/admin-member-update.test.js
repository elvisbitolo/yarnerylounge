import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeAdminExpiry, normalizeAdminPlan, normalizeAdminRole } from "../admin-member-update.js";

test("normalizeAdminPlan accepts only canonical tiers", () => {
  assert.deepEqual(normalizeAdminPlan("moving-in"), { ok: true, plan: "moving-in" });
  assert.deepEqual(normalizeAdminPlan(" Hooking-Up "), { ok: true, plan: "hooking-up" });
  assert.deepEqual(normalizeAdminPlan(undefined), { ok: true, plan: undefined });
  assert.equal(normalizeAdminPlan("owner").ok, false);
});

test("normalizeAdminRole allows assignable roles but never owner", () => {
  assert.deepEqual(normalizeAdminRole("host"), { ok: true, role: "host" });
  assert.deepEqual(normalizeAdminRole("moderator"), { ok: true, role: "moderator" });
  assert.deepEqual(normalizeAdminRole("member"), { ok: true, role: "member" });
  assert.equal(normalizeAdminRole("owner").ok, false);
  assert.equal(normalizeAdminRole("co-host").ok, false);
});

test("normalizeAdminExpiry treats a calendar date as the end of that UTC day", () => {
  const result = normalizeAdminExpiry("2026-12-25");
  assert.equal(result.ok, true);
  assert.equal(result.expiresAt.toISOString(), "2026-12-25T23:59:59.999Z");
});

test("normalizeAdminExpiry clears on blank input and rejects invalid input", () => {
  assert.deepEqual(normalizeAdminExpiry(""), { ok: true, expiresAt: null });
  assert.deepEqual(normalizeAdminExpiry(null), { ok: true, expiresAt: null });
  assert.equal(normalizeAdminExpiry("not-a-date").ok, false);
});
