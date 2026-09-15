import assert from "node:assert/strict";
import { test } from "node:test";
import {
  nextOccurrenceAt,
  normalizeRecurring,
  recurringWeekday,
  recurringLabel,
  recurringDayMatches,
} from "../availability-core.js";

test("normalizeRecurring keeps none, weekly, and weekday values only", () => {
  assert.equal(normalizeRecurring("none"), "none");
  assert.equal(normalizeRecurring("weekly"), "weekly");
  assert.equal(normalizeRecurring("weekly-3"), "weekly-3");
  assert.equal(normalizeRecurring("weekly-0"), "weekly-0");
  assert.equal(normalizeRecurring("weekly-7"), "none");
  assert.equal(normalizeRecurring("daily"), "none");
  assert.equal(normalizeRecurring(""), "none");
  assert.equal(normalizeRecurring(undefined), "none");
});

test("recurringWeekday reads the weekday from weekly-N values", () => {
  assert.equal(recurringWeekday("weekly-1"), 1);
  assert.equal(recurringWeekday("weekly-0"), 0);
  assert.equal(recurringWeekday("weekly"), null);
  assert.equal(recurringWeekday("none"), null);
  assert.equal(recurringWeekday("garbage"), null);
});

test("recurringLabel renders friendly repeat names", () => {
  assert.equal(recurringLabel("none"), "Once");
  assert.equal(recurringLabel("weekly"), "Every week");
  assert.equal(recurringLabel("weekly-1"), "Every Monday");
  assert.equal(recurringLabel("weekly-0"), "Every Sunday");
});

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

test("nextOccurrenceAt: weekday repeat aligns to the next matching weekday", () => {
  const startAt = "2026-09-15T18:00:00.000Z"; // Tuesday
  const now = new Date("2026-09-15T12:00:00.000Z");
  assert.equal(nextOccurrenceAt({ startAt, recurring: "weekly-2" }, now), startAt);
  // Start on a Wednesday but repeat Mondays -> upcoming Monday.
  const wed = "2026-09-16T18:00:00.000Z";
  assert.equal(
    nextOccurrenceAt({ startAt: wed, recurring: "weekly-1" }, new Date("2026-09-16T12:00:00.000Z")),
    "2026-09-21T18:00:00.000Z"
  );
  // After the next Monday passes, advance a further week.
  assert.equal(
    nextOccurrenceAt({ startAt: wed, recurring: "weekly-1" }, new Date("2026-09-22T19:00:00.000Z")),
    "2026-09-28T18:00:00.000Z"
  );
});

test("recurringDayMatches: weekday repeat lands on its weekday from the aligned first occurrence", () => {
  const block = { startAt: "2026-09-16T18:00:00.000Z", recurring: "weekly-1" }; // Wed start, Mon repeat
  assert.equal(recurringDayMatches(block, new Date("2026-09-14T00:00:00.000Z")), false); // before aligned start
  assert.equal(recurringDayMatches(block, new Date("2026-09-16T00:00:00.000Z")), false); // Wednesday, no
  assert.equal(recurringDayMatches(block, new Date("2026-09-21T00:00:00.000Z")), true); // first Monday
  assert.equal(recurringDayMatches(block, new Date("2026-09-28T00:00:00.000Z")), true); // next Monday
});

test("recurringDayMatches: non-recurring blocks never match", () => {
  assert.equal(recurringDayMatches({ startAt: "2026-09-21T18:00:00.000Z", recurring: "none" }, new Date("2026-09-21T00:00:00.000Z")), false);
});

test("nextOccurrenceAt: malformed dates yield null", () => {
  assert.equal(nextOccurrenceAt({ startAt: "not-a-date", recurring: "none" }), null);
});