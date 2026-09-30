import assert from "node:assert/strict";
import { test } from "node:test";
import {
  nextOccurrenceAt,
  normalizeRecurring,
  normalizeTimeZone,
  recurringWeekday,
  recurringLabel,
  recurringDayMatches,
  availabilityWindowWhere,
  availabilityListOrder,
  AVAILABILITY_LIST_LIMIT,
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

// Regression: a weekly block stores only its first occurrence, so filtering
// recurring rows by the window's lower bound removed them for good once that
// date passed. The query must keep them and let the per-day match filter.
test("availabilityWindowWhere: no window matches everything", () => {
  assert.deepEqual(availabilityWindowWhere({}), {});
  assert.deepEqual(availabilityWindowWhere(), {});
});

test("availabilityWindowWhere: recurring rows are never bounded by `from`", () => {
  const where = availabilityWindowWhere({
    from: "2026-09-29T08:09:00.000Z",
    to: "2026-11-28T08:09:00.000Z",
  });
  const [oneOff, recurring] = where.OR;

  // One-off: real lower and upper bounds on the single occurrence. Prisma
  // rejects null inside `in`, so NULL and "none" are separate clauses.
  assert.deepEqual(oneOff.OR, [{ recurring: null }, { recurring: "none" }]);
  assert.equal(oneOff.startAt.gte.toISOString(), "2026-09-29T08:09:00.000Z");
  assert.equal(oneOff.endAt.lte.toISOString(), "2026-11-28T08:09:00.000Z");

  // Recurring: only an upper bound. No `gte`, so a past anchor still matches.
  assert.equal(recurring.startAt.gte, undefined);
  assert.equal(recurring.startAt.lte.toISOString(), "2026-11-28T08:09:00.000Z");
  assert.deepEqual(recurring.recurring, { startsWith: "weekly" });
});

test("availabilityWindowWhere: no clause relies on `in` with a null", () => {
  // Prisma throws "Expected ListStringFieldRefInput or Null" for in: [null, x],
  // and listAvailability swallows the throw into an empty result, which reads
  // as "no availability exists" rather than as an error.
  const { OR: [oneOff] } = availabilityWindowWhere({ from: "2026-09-29T00:00:00.000Z" });
  for (const clause of oneOff.OR) {
    assert.ok(clause.recurring === null || typeof clause.recurring === "string");
    assert.equal(clause.recurring?.in, undefined);
  }
});

test("availabilityWindowWhere: matches weekly-N and legacy weekly, not 'none'", () => {
  const { OR: [, recurring] } = availabilityWindowWhere({ from: "2026-09-29T00:00:00.000Z" });
  const { startsWith } = recurring.recurring;
  for (const value of ["weekly", "weekly-0", "weekly-1", "weekly-5"]) {
    assert.equal(value.startsWith(startsWith), true, `${value} should be recurring`);
  }
  for (const value of ["none", "daily", null, ""]) {
    assert.equal(value?.startsWith(startsWith) ?? false, false, `${value} should not be recurring`);
  }
});

test("availabilityWindowWhere: an open-ended window drops no bounds", () => {
  const { OR: [oneOff, recurring] } = availabilityWindowWhere({ from: "2026-09-29T00:00:00.000Z" });
  assert.equal(oneOff.endAt, undefined);
  assert.equal(recurring.startAt, undefined);
});

test("availabilityWindowWhere: an upper bound alone still keeps past anchors", () => {
  const { OR: [oneOff, recurring] } = availabilityWindowWhere({ to: "2026-11-28T00:00:00.000Z" });
  assert.equal(oneOff.startAt, undefined);
  assert.equal(recurring.startAt.lte.toISOString(), "2026-11-28T00:00:00.000Z");
});

test("availabilityWindowWhere: invalid bounds are ignored rather than throwing", () => {
  assert.deepEqual(availabilityWindowWhere({ from: "not-a-date" }), {});
  assert.deepEqual(availabilityWindowWhere({ to: "nonsense", from: "also-bad" }), {});
});

test("availabilityWindowWhere: a past-start weekly block survives the filter the calendar sends", () => {
  // "Monday Make Along" anchored 2026-09-28, viewed on 2026-09-29.
  const where = availabilityWindowWhere({
    from: "2026-09-29T08:09:00.000Z",
    to: "2026-11-28T08:09:00.000Z",
  });
  const { OR: [, recurring] } = where;
  const anchor = new Date("2026-09-28T12:00:00.000Z");
  const from = where.OR[0].startAt.gte;
  const matchesLowerBound = anchor >= from;
  assert.equal(matchesLowerBound, false, "anchor predates `from`, which used to drop it");
  assert.ok(
    anchor <= recurring.startAt.lte,
    "but it is before the window end, so the recurring clause still returns it"
  );
});

test("availabilityListOrder: a windowed read keeps the soonest blocks", () => {
  // The calendar sends from=now, so ascending puts the blocks the viewer is
  // about to scroll onto inside the cap.
  assert.deepEqual(availabilityListOrder({ from: "2026-09-29T00:00:00.000Z" }), { startAt: "asc" });
});

test("availabilityListOrder: an unwindowed read takes the newest, not the oldest", () => {
  // This is the bug. With no `from` the where clause is empty, so the cap is the
  // only bound on the whole table. Ascending here returned the 500 oldest blocks
  // ever created, and the events page picked its 12 soonest occurrences out of
  // those -- so a newly added hangout could never appear, however recent.
  assert.deepEqual(availabilityListOrder({}), { startAt: "desc" });
  assert.deepEqual(availabilityListOrder(), { startAt: "desc" });
  assert.deepEqual(availabilityListOrder({ to: "2026-11-28T00:00:00.000Z" }), { startAt: "desc" });
});

test("availabilityListOrder: descending is what keeps a new block reachable", () => {
  // Models the events page: 500 rows already in the table, then a hangout added
  // now. Under the old ascending order the new row fell off the end of the cap.
  const old = Array.from({ length: 500 }, (_, i) => ({
    startAt: new Date(Date.UTC(2020, 0, 1) + i * 86400000),
  }));
  const fresh = { startAt: new Date(Date.UTC(2026, 8, 29)) };
  const table = [...old, fresh];

  const take = (order) => {
    const sign = order.startAt === "asc" ? 1 : -1;
    return [...table].sort((a, b) => sign * (a.startAt - b.startAt)).slice(0, 500);
  };

  const ascRows = take({ startAt: "asc" });
  assert.equal(ascRows.includes(fresh), false, "ascending: the new block is unreachable");
  assert.equal(take({ startAt: "desc" }).includes(fresh), true);
});

test("AVAILABILITY_LIST_LIMIT leaves room to detect truncation", () => {
  // listAvailability asks for limit + 1 so a capped read is visible instead of
  // silently reading as complete.
  assert.equal(typeof AVAILABILITY_LIST_LIMIT, "number");
  assert.ok(AVAILABILITY_LIST_LIMIT > 0);
});

test("normalizeTimeZone accepts real IANA zones and rejects non-zones", () => {
  assert.equal(normalizeTimeZone("Africa/Nairobi"), "Africa/Nairobi");
  assert.equal(normalizeTimeZone("America/New_York"), "America/New_York");
  assert.equal(normalizeTimeZone("Europe/London"), "Europe/London");
  assert.equal(normalizeTimeZone("Australia/Sydney"), "Australia/Sydney");
  // Region-qualified: needed to survive a DST transition in its own zone.
  assert.equal(normalizeTimeZone("America/Argentina/Buenos_Aires"), "America/Argentina/Buenos_Aires");

  // "UTC" is what some browsers report, and it carries no DST information, so a
  // recurring block pinned to it would drift twice a year.
  assert.equal(normalizeTimeZone("UTC"), null);
  assert.equal(normalizeTimeZone("GMT"), null);
  assert.equal(normalizeTimeZone("Z"), null);

  assert.equal(normalizeTimeZone(""), null);
  assert.equal(normalizeTimeZone("   "), null);
  assert.equal(normalizeTimeZone(null), null);
  assert.equal(normalizeTimeZone(undefined), null);
  assert.equal(normalizeTimeZone(42), null);
  assert.equal(normalizeTimeZone({ timeZone: "Africa/Nairobi" }), null);

  // SQL injection and path-like values must not reach the column.
  assert.equal(normalizeTimeZone("'; DROP TABLE \"User\"; --"), null);
  assert.equal(normalizeTimeZone("../../etc/passwd"), null);
  // A bare city name is not a zone and would throw at Intl/Postgres.
  assert.equal(normalizeTimeZone("Nairobi"), null);
});