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
