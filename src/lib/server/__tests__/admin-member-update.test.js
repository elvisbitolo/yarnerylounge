import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAdminExpiry,
  normalizeAdminPlan,
  normalizeAdminRole,
  resolveAdminMemberStatus,
} from "../admin-member-update.js";

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

const NOW = new Date("2026-11-26T00:00:00.000Z").getTime();

test("resolveAdminMemberStatus treats staff access as role-based even with an expired subscription", () => {
  const expired = { status: "active", currentPeriodEnd: new Date("2026-01-01T00:00:00.000Z") };
  assert.deepEqual(resolveAdminMemberStatus({ role: "owner" }, expired, NOW), {
    category: "active",
    label: "Role access",
    code: "role",
  });
  assert.deepEqual(resolveAdminMemberStatus({ role: "moderator" }, null, NOW), {
    category: "active",
    label: "Role access",
    code: "role",
  });
});

test("resolveAdminMemberStatus counts past_due as active while it is within its period", () => {
  const sub = { status: "past_due", currentPeriodEnd: new Date("2026-12-01T00:00:00.000Z") };
  assert.deepEqual(resolveAdminMemberStatus({ role: "member" }, sub, NOW), {
    category: "active",
    label: "Payment past due",
    code: "past_due",
  });
});

test("resolveAdminMemberStatus reports expired paid subscriptions and suspensions", () => {
  const expired = { status: "active", currentPeriodEnd: new Date("2026-01-01T00:00:00.000Z") };
  assert.deepEqual(resolveAdminMemberStatus({ role: "member" }, expired, NOW), {
    category: "inactive",
    label: "Inactive",
    code: "inactive",
  });
  assert.deepEqual(resolveAdminMemberStatus({ role: "owner", suspended: true }, null, NOW), {
    category: "suspended",
    label: "Suspended",
    code: "suspended",
  });
});
