import { test } from "node:test";
import assert from "node:assert/strict";
import { isMembershipExpired } from "../billing.js";

const now = Date.now();
const future = new Date(now + 24 * 60 * 60 * 1000);
const past = new Date(now - 24 * 60 * 60 * 1000);

test("active paid subscription overrides a stale expired user timestamp", () => {
  assert.equal(
    isMembershipExpired(
      { plan: "hooking-up", expiresAt: past },
      { tier: "hooking-up", status: "active", currentPeriodEnd: future },
      now
    ),
    false
  );
});

test("expired paid subscription remains expired even if user timestamp is future", () => {
  assert.equal(
    isMembershipExpired(
      { plan: "hooking-up", expiresAt: future },
      { tier: "hooking-up", status: "active", currentPeriodEnd: past },
      now
    ),
    true
  );
});

test("canceled paid subscription is expired", () => {
  assert.equal(
    isMembershipExpired(
      { plan: "hooking-up", expiresAt: future },
      { tier: "hooking-up", status: "canceled" },
      now
    ),
    true
  );
});

test("free subscription does not trigger the expired paid-plan screen", () => {
  assert.equal(
    isMembershipExpired(
      { plan: "hooking-up", expiresAt: past },
      { tier: "flirting", status: "active" },
      now
    ),
    false
  );
});

test("legacy user records still use their own expiry timestamp", () => {
  assert.equal(isMembershipExpired({ plan: "moving-in", expiresAt: past }, null, now), true);
  assert.equal(isMembershipExpired({ plan: "moving-in", expiresAt: future }, null, now), false);
});

test("owner and moderator never count as expired", () => {
  assert.equal(
    isMembershipExpired({ role: "owner", plan: "moving-in", expiresAt: past }, null, now),
    false
  );
  assert.equal(
    isMembershipExpired(
      { role: "moderator", plan: "hooking-up", expiresAt: past },
      { tier: "hooking-up", status: "canceled" },
      now
    ),
    false
  );
});
