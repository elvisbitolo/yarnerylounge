import assert from "node:assert/strict";
import { test } from "node:test";
import { nextOccurrenceAt } from "../availability-core.js";

test("nextOccurrenceAt: one-off block stays as its start time", () => {
  const iso = "2026-09-20T18:00:00.000Z";
  assert.equal(nextOccurrenceAt({ startAt: iso, recurring: "none" }, new Date("2026-09-15T12:00:00.000Z")), iso);
});

test("nextOccurrenceAt: past one-off block is hidden", () => {
  assert.equal(
    nextOccurrenceAt({ startAt: "2026-09-01T18:00:00.000Z", recurring: "none" }, new Date("2026-09-15T12:00:00.000Z")),
    null
  );
});

test("nextOccurrenceAt: weekly block advances to the next upcoming repeat", () => {
  const startAt = "2026-09-01T18:00:00.000Z";
  const now = new Date("2026-09-15T12:00:00.000Z");
  const next = nextOccurrenceAt({ startAt, recurring: "weekly" }, now);
  assert.equal(next, "2026-09-15T18:00:00.000Z");
});

test("nextOccurrenceAt: weekly block in the future keeps its own time", () => {
  const startAt = "2026-10-05T18:00:00.000Z";
  assert.equal(nextOccurrenceAt({ startAt, recurring: "weekly" }, new Date("2026-09-15T12:00:00.000Z")), startAt);
});

test("nextOccurrenceAt: malformed dates yield null", () => {
  assert.equal(nextOccurrenceAt({ startAt: "not-a-date", recurring: "none" }), null);
});