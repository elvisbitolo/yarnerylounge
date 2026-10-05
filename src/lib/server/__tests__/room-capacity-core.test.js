import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCapacity, evaluateJoinCapacity } from "../room-capacity-core.js";

test("normalizeCapacity treats missing, zero and negative caps as unlimited", () => {
  assert.equal(normalizeCapacity(undefined), 0);
  assert.equal(normalizeCapacity(null), 0);
  assert.equal(normalizeCapacity(0), 0);
  assert.equal(normalizeCapacity(-5), 0);
  assert.equal(normalizeCapacity("nonsense"), 0);
});

test("normalizeCapacity floors a fractional cap and keeps a real one", () => {
  assert.equal(normalizeCapacity(20), 20);
  assert.equal(normalizeCapacity(7.9), 7);
  assert.equal(normalizeCapacity("30"), 30);
});

test("an unlimited room always admits a newcomer", () => {
  const r = evaluateJoinCapacity({ maxParticipants: 0, activeCount: 9999 });
  assert.equal(r.allowed, true);
  assert.equal(r.full, false);
  assert.equal(r.reason, "unlimited");
});

test("a room below capacity admits a newcomer", () => {
  const r = evaluateJoinCapacity({ maxParticipants: 20, activeCount: 4 });
  assert.equal(r.allowed, true);
  assert.equal(r.full, false);
  assert.equal(r.reason, "has-room");
});

test("a room exactly at capacity refuses a newcomer", () => {
  const r = evaluateJoinCapacity({ maxParticipants: 20, activeCount: 20 });
  assert.equal(r.allowed, false);
  assert.equal(r.full, true);
  assert.equal(r.reason, "at-capacity");
});

test("an overfull room still refuses a newcomer", () => {
  const r = evaluateJoinCapacity({ maxParticipants: 5, activeCount: 9 });
  assert.equal(r.allowed, false);
  assert.equal(r.full, true);
});

test("staff and the room host are never locked out, even when full", () => {
  const r = evaluateJoinCapacity({
    maxParticipants: 2,
    activeCount: 2,
    alreadyPresent: false,
    exempt: true,
  });
  assert.equal(r.allowed, true);
  assert.equal(r.reason, "staff-or-host");
});

test("a member already holding a place keeps it when the room fills up", () => {
  // This is the "guaranteed spot" rule: capacity gates entry, never eviction.
  const r = evaluateJoinCapacity({
    maxParticipants: 3,
    activeCount: 3,
    alreadyPresent: true,
  });
  assert.equal(r.allowed, true);
  assert.equal(r.reason, "already-present");
});

test("a full room of exempt members still blocks ordinary newcomers", () => {
  const r = evaluateJoinCapacity({
    maxParticipants: 1,
    activeCount: 1,
    alreadyPresent: false,
    exempt: false,
  });
  assert.equal(r.allowed, false);
  assert.equal(r.full, true);
});

test("a missing argument object defaults to an allowed join", () => {
  const r = evaluateJoinCapacity();
  assert.equal(r.allowed, true);
});

test("capacity is decided from activeCount only, not from a stale total", () => {
  // Left participants must not count: callers pass the live active headcount.
  const r = evaluateJoinCapacity({ maxParticipants: 2, activeCount: 1 });
  assert.equal(r.allowed, true);
  assert.equal(r.activeCount, 1);
});