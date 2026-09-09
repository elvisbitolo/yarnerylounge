import { test } from "node:test";
import assert from "node:assert/strict";
import { toMillis, mapUserRow, isPaidPlanExpired, mapUserForApi } from "../user-core.js";

test("toMillis normalizes every timestamp shape", () => {
  assert.equal(toMillis(0), 0);
  assert.equal(toMillis(null), 0);
  assert.equal(toMillis(undefined), 0);
  assert.equal(toMillis(1234), 1234);
  assert.equal(toMillis(new Date("2025-01-01")), new Date("2025-01-01").getTime());
  assert.equal(toMillis("2025-01-01"), new Date("2025-01-01").getTime());
  assert.equal(toMillis({ toMillis: () => 42 }), 42);
  assert.equal(toMillis("garbage"), 0);
  assert.equal(toMillis(NaN), 0);
});

test("isPaidPlanExpired: paid plan + lapsed expiresAt", () => {
  const now = Date.now();
  assert.equal(isPaidPlanExpired({ plan: "moving-in", expiresAt: now - 1000 }, now), true);
  assert.equal(isPaidPlanExpired({ plan: "hooking-up", expiresAt: now - 1000 }, now), true);
});

test("isPaidPlanExpired: flirting never expires", () => {
  assert.equal(isPaidPlanExpired({ plan: "flirting", expiresAt: 1 }, Date.now()), false);
});

test("isPaidPlanExpired: future expiry is not expired", () => {
  const now = Date.now();
  assert.equal(isPaidPlanExpired({ plan: "hooking-up", expiresAt: now + 1000 }, now), false);
});

test("isPaidPlanExpired: tolerates number, string, Date, Timestamp", () => {
  const now = Date.now();
  assert.equal(isPaidPlanExpired({ plan: "moving-in", expiresAt: now - 1 }, now), true);
  assert.equal(
    isPaidPlanExpired({ plan: "moving-in", expiresAt: new Date(now - 1).toISOString() }, now),
    true
  );
  assert.equal(isPaidPlanExpired({ plan: "moving-in", expiresAt: new Date(now - 1) }, now), true);
  assert.equal(
    isPaidPlanExpired({ plan: "moving-in", expiresAt: { toMillis: () => now - 1 } }, now),
    true
  );
});

test("mapUserRow: null stays null and empty row keeps active-shaped defaults", () => {
  assert.equal(mapUserRow(null), null);
  const u = mapUserRow({ id: "u1" });
  assert.equal(u.role, "member");
  assert.equal(u.plan, "flirting");
  assert.equal(u.paymentStatus, "unpaid");
  assert.deepEqual(u.hobbies, []);
  assert.equal(u.expiresAt, 0);
});

test("mapUserRow: full row maps to Firestore doc shape with epoch-millis timestamps", () => {
  const ts = new Date("2025-02-01T00:00:00Z");
  const row = {
    id: "u1",
    name: "Ava",
    username: "ava",
    email: "ava@example.com",
    role: "host",
    plan: "moving-in",
    paymentStatus: "paid",
    hobbies: ["Sourdough"],
    crafts: ["Amigurumi"],
    expiresAt: ts,
    createdAt: ts,
  };
  const u = mapUserRow(row);
  assert.equal(u.id, "u1");
  assert.equal(u.name, "Ava");
  assert.equal(u.role, "host");
  assert.equal(u.plan, "moving-in");
  assert.equal(u.paymentStatus, "paid");
  assert.deepEqual(u.hobbies, ["Sourdough"]);
  assert.equal(u.expiresAt, ts.getTime());
  assert.equal(u.createdAt, ts.getTime());
  assert.equal(u.suspended, false);
});

test("mapUserForApi: exposes skills + interests buckets", () => {
  const api = mapUserForApi({ id: "u1", skillLevel: "intermediate", crafts: ["Crochet"] });
  assert.equal(api.skills.skillLevel, "intermediate");
  assert.deepEqual(api.interests.crafts, ["Crochet"]);
  assert.equal(api.skills.favoriteHookSize, "");
});