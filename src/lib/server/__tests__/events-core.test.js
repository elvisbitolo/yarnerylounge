import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRsvpCounts, expandEvents } from "../events-core.js";

test("applyRsvpCounts: joining under capacity increments", () => {
  const { full, counts } = applyRsvpCounts({ a: 2 }, "b", 5, true);
  assert.equal(full, false);
  assert.deepEqual(counts, { a: 2, b: 1 });
});

test("applyRsvpCounts: joining at capacity is full", () => {
  const { full, counts } = applyRsvpCounts({ a: 5 }, "a", 5, true);
  assert.equal(full, true);
  assert.deepEqual(counts, { a: 5 });
});

test("applyRsvpCounts: joining with no capacity never fills", () => {
  const { full, counts } = applyRsvpCounts({ a: 999 }, "a", 0, true);
  assert.equal(full, false);
  assert.equal(counts.a, 1000);
});

test("applyRsvpCounts: leaving decrements", () => {
  const { counts } = applyRsvpCounts({ a: 3 }, "a", 5, false);
  assert.deepEqual(counts, { a: 2 });
});

test("applyRsvpCounts: leaving a zero-count key drops it", () => {
  const { counts } = applyRsvpCounts({ a: 1 }, "a", 5, false);
  assert.deepEqual(counts, {});
});

test("applyRsvpCounts: missing counts default to zero", () => {
  const { full, counts } = applyRsvpCounts(null, "x", 2, true);
  assert.equal(full, false);
  assert.deepEqual(counts, { x: 1 });
});

// A block promoted to a meetup repeats, so every occurrence must keep its own
// real end time. Shifting only startTime left all later occurrences ending on
// the first occurrence's end.
test("expandEvents: each occurrence keeps the block's own duration", () => {
  const event = {
    id: "evt1",
    title: "Stitch Along",
    startTime: "2026-09-29T19:00:00.000Z",
    endTime: "2026-09-29T21:30:00.000Z",
    recurrence: { freq: "weekly", interval: 1, count: 3 },
  };
  const out = expandEvents([event]);
  assert.equal(out.length, 3);

  const minutes = (s, e) => (new Date(e).getTime() - new Date(s).getTime()) / 60000;
  for (const occ of out) {
    assert.equal(
      minutes(occ.startTime, occ.endTime),
      150,
      `occurrence ${occ.occurrenceIndex} should still be 150 minutes long`
    );
  }

  // And the end time must actually advance week to week, not sit on occurrence 0.
  assert.equal(out[0].endTime.toISOString(), "2026-09-29T21:30:00.000Z");
  assert.equal(out[1].endTime.toISOString(), "2026-10-06T21:30:00.000Z");
  assert.equal(out[2].endTime.toISOString(), "2026-10-13T21:30:00.000Z");
});

test("expandEvents: a non-recurring event is untouched", () => {
  // Dates, not strings: the no-recurrence path returns the event as-is, so
  // there is no normalisation to apply. listEvents always hands over Dates.
  const event = {
    id: "evt2",
    title: "One Off",
    startTime: new Date("2026-09-29T19:00:00.000Z"),
    endTime: new Date("2026-09-29T21:30:00.000Z"),
  };
  const out = expandEvents([event]);
  assert.equal(out.length, 1);
  assert.equal(out[0].endTime.toISOString(), "2026-09-29T21:30:00.000Z");
});

test("expandEvents: a recurring event with no end time has none either", () => {
  const event = {
    id: "evt3",
    title: "Open Ended",
    startTime: "2026-09-29T19:00:00.000Z",
    endTime: null,
    recurrence: { freq: "weekly", interval: 1, count: 2 },
  };
  const out = expandEvents([event]);
  assert.equal(out.length, 2);
  for (const occ of out) assert.equal(occ.endTime, null);
});
