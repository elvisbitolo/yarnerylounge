import { test } from "node:test";
import assert from "node:assert/strict";
import { selectEmailMember } from "../member-resolution.js";

test("selects the existing paid active Moving In account over a free duplicate", () => {
  const paid = { id: "legacy-moving-in", plan: "moving-in", paymentStatus: "paid", subscription: { status: "active", tier: "moving-in" } };
  const free = { id: "new-flirting", plan: "flirting", paymentStatus: "unpaid", subscription: null };
  assert.deepEqual(selectEmailMember([free, paid]), { member: paid, ambiguous: false });
});

test("does not guess when duplicate email accounts have equal entitlement", () => {
  const first = { id: "one", plan: "moving-in", paymentStatus: "paid", subscription: { status: "active" } };
  const second = { id: "two", plan: "moving-in", paymentStatus: "paid", subscription: { status: "active" } };
  assert.deepEqual(selectEmailMember([first, second]), { member: null, ambiguous: true });
});

test("returns no match for an empty candidate list", () => {
  assert.deepEqual(selectEmailMember([]), { member: null, ambiguous: false });
});

test("prefers the original paid member when the Supabase UID matches a lower-tier duplicate", () => {
  const original = {
    id: "74f31134-bf0f-41ea-bc6d-9b4451b440cf",
    email: "mamameer@gmail.com",
    plan: "moving-in",
    paymentStatus: "paid",
    subscription: { status: "active", tier: "moving-in", provider: "admin" },
  };
  const uidMatchedDuplicate = {
    id: "0ac99b32-262b-42ce-9a39-6da89d4cb4ee",
    email: "mamameer@gmail.com",
    plan: "flirting",
    paymentStatus: "unpaid",
    subscription: null,
  };

  // The route includes the UID-matched row and all verified-email matches.
  const result = selectEmailMember([uidMatchedDuplicate, original]);
  assert.equal(result.ambiguous, false);
  assert.equal(result.member.id, original.id);
});
