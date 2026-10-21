import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PUBLIC_EVENT_WHERE,
  isPublicRoom,
  nextOccurrences,
  parsePublicLimit,
  publicEventWhere,
  toPublicEvent,
} from "../public-events-core.js";

// SQL three-valued logic: a comparison against NULL is UNKNOWN, and a WHERE
// clause keeps only the rows that evaluate to TRUE. This models just enough of
// Postgres to prove which rows the public rule keeps.
const TRUE = "true";
const FALSE = "false";
const UNKNOWN = "unknown";

function isNull(value) {
  return value === null || value === undefined;
}

function negate(value) {
  if (value === TRUE) return FALSE;
  if (value === FALSE) return TRUE;
  return UNKNOWN;
}

function conjunction(a, b) {
  if (a === FALSE || b === FALSE) return FALSE;
  if (a === UNKNOWN || b === UNKNOWN) return UNKNOWN;
  return TRUE;
}

function disjunction(a, b) {
  if (a === TRUE || b === TRUE) return TRUE;
  if (a === UNKNOWN || b === UNKNOWN) return UNKNOWN;
  return FALSE;
}

// Evaluate a filter against a row, returning TRUE, FALSE or UNKNOWN.
function evaluate(filter, row) {
  if (!filter) return TRUE;
  if (filter.OR) {
    return filter.OR.map((part) => evaluate(part, row)).reduce(disjunction);
  }
  if (filter.AND) {
    const parts = Array.isArray(filter.AND) ? filter.AND : [filter.AND];
    return parts.map((part) => evaluate(part, row)).reduce(conjunction);
  }
  if (filter.NOT) {
    return negate(evaluate(filter.NOT, row));
  }
  if (filter.is) {
    return evaluate(filter.is, row);
  }

  const [field, expected] = Object.entries(filter)[0];
  const actual = row[field];

  // A relation filter such as { space: { is: { ... } } }.
  if (expected && typeof expected === "object" && "is" in expected) {
    const related = row[field];
    if (isNull(related)) return FALSE;
    return evaluate(expected.is, related);
  }

  // "field IS NULL" — always TRUE or FALSE, never UNKNOWN.
  if (expected === null) {
    return isNull(actual) ? TRUE : FALSE;
  }

  // "field <> value" — UNKNOWN when the column is NULL.
  if (expected && typeof expected === "object" && "not" in expected) {
    if (isNull(actual)) return UNKNOWN;
    return actual === expected.not ? FALSE : TRUE;
  }

  // Range comparisons, e.g. { gte: date }.
  if (expected && typeof expected === "object") {
    if (isNull(actual)) return UNKNOWN;
    if ("gte" in expected) return actual >= expected.gte ? TRUE : FALSE;
    if ("lte" in expected) return actual <= expected.lte ? TRUE : FALSE;
    if ("gt" in expected) return actual > expected.gt ? TRUE : FALSE;
    if ("lt" in expected) return actual < expected.lt ? TRUE : FALSE;
  }

  if (isNull(actual)) return UNKNOWN;
  return actual === expected ? TRUE : FALSE;
}

// A row survives the filter only when it evaluates to TRUE.
function keeps(filter, row) {
  return evaluate(filter, row) === TRUE;
}

const PUBLIC_SPACE = { publicPreview: true, access: "public", status: "active" };

function eventRow(overrides = {}) {
  return {
    id: "event-1",
    title: "Test event",
    description: "",
    publicPreview: true,
    membersOnly: false,
    startTime: new Date("2026-06-01T19:00:00.000Z"),
    spaceId: null,
    space: null,
    ...overrides,
  };
}

function inSpace(space, overrides = {}) {
  return eventRow({ spaceId: "space-1", space, ...overrides });
}

test("the public rule keeps an event that opted into previewing", () => {
  assert.equal(keeps(PUBLIC_EVENT_WHERE, eventRow()), true);
});

test("the public rule hides events nobody opted into previewing", () => {
  // The regression this guards: the public feed used to ask for nothing but
  // membersOnly = false, so every event in the database was published to the
  // landing page, including meetups promoted from a member's availability
  // block, whose title and note are that member's own words.
  assert.equal(keeps(PUBLIC_EVENT_WHERE, eventRow({ publicPreview: false })), false);
  assert.equal(keeps(PUBLIC_EVENT_WHERE, eventRow({ publicPreview: null })), false);
});

test("the public rule hides members-only meetups", () => {
  assert.equal(keeps(PUBLIC_EVENT_WHERE, eventRow({ membersOnly: true })), false);
});

test("the public rule keeps events in a publicly visible space", () => {
  assert.equal(keeps(PUBLIC_EVENT_WHERE, inSpace(PUBLIC_SPACE)), true);
  // A private space is still visible to non-members elsewhere in the app.
  assert.equal(
    keeps(PUBLIC_EVENT_WHERE, inSpace({ ...PUBLIC_SPACE, access: "private" })),
    true
  );
});

test("the public rule hides events in a space that is not public", () => {
  assert.equal(
    keeps(PUBLIC_EVENT_WHERE, inSpace({ ...PUBLIC_SPACE, publicPreview: false })),
    false
  );
  assert.equal(
    keeps(PUBLIC_EVENT_WHERE, inSpace({ ...PUBLIC_SPACE, publicPreview: null })),
    false
  );
});

test("the public rule hides events in an invite-only space", () => {
  assert.equal(
    keeps(PUBLIC_EVENT_WHERE, inSpace({ ...PUBLIC_SPACE, access: "invite" })),
    false
  );
});

test("the public rule hides events in a deleted space", () => {
  assert.equal(
    keeps(PUBLIC_EVENT_WHERE, inSpace({ ...PUBLIC_SPACE, status: "deleted" })),
    false
  );
});

test("the public rule reads a null space state the way the app does", () => {
  // mapSpaceRow in spaces-core.js reads a null access as "public" and a null
  // status as "active", so a space that never had those columns set is still
  // publicly visible.
  assert.equal(
    keeps(PUBLIC_EVENT_WHERE, inSpace({ ...PUBLIC_SPACE, access: null })),
    true
  );
  assert.equal(
    keeps(PUBLIC_EVENT_WHERE, inSpace({ ...PUBLIC_SPACE, status: null })),
    true
  );
});

test("the rule never regresses to a null-unsafe comparison", () => {
  // "access <> 'invite'" is UNKNOWN for a null column, so it would drop every
  // space that never had its access set.
  assert.equal(evaluate({ access: { not: "invite" } }, { access: null }), UNKNOWN);
  assert.equal(evaluate({ status: { not: "deleted" } }, { status: null }), UNKNOWN);

  const serialized = JSON.stringify(PUBLIC_EVENT_WHERE);
  assert.ok(serialized.includes("null"), "must match the null state explicitly");
});

test("the rule combines with other conditions", () => {
  const filter = publicEventWhere({ startTime: { gte: new Date("2026-01-01") } });
  assert.equal(keeps(filter, eventRow()), true);
  assert.equal(keeps(filter, eventRow({ publicPreview: false })), false);
});

test("a room is only named publicly while it previews publicly", () => {
  assert.equal(isPublicRoom({ publicPreview: true, status: "active" }), true);
  assert.equal(isPublicRoom({ publicPreview: true, status: null }), true);
  assert.equal(isPublicRoom({ publicPreview: false, status: "active" }), false);
  assert.equal(isPublicRoom({ publicPreview: true, status: "deleted" }), false);
  assert.equal(isPublicRoom(null), false);
});

test("the public shape hides a room that is not previewing publicly", () => {
  const hidden = toPublicEvent({
    id: "event-1",
    title: "Test event",
    description: "A description",
    startTime: new Date("2026-05-01T19:00:00.000Z"),
    endTime: new Date("2026-05-01T21:00:00.000Z"),
    roomSlug: "velvet-den",
    room: { publicPreview: false, status: "active" },
  });
  assert.equal(hidden.roomSlug, "");
  assert.equal(hidden.title, "Test event");
  assert.equal(hidden.startTime, "2026-05-01T19:00:00.000Z");
  assert.equal(hidden.endTime, "2026-05-01T21:00:00.000Z");
});

test("the public shape names a room that is previewing publicly", () => {
  const shown = toPublicEvent({
    id: "event-2",
    title: "",
    description: "x".repeat(200),
    startTime: new Date("2026-05-01T19:00:00.000Z"),
    endTime: null,
    roomSlug: "lo-fi-and-loops",
    room: { publicPreview: true, status: "active" },
  });
  assert.equal(shown.roomSlug, "lo-fi-and-loops");
  assert.equal(shown.title, "Speakeasy event");
  assert.equal(shown.description.length, 160);
  assert.equal(shown.endTime, null);
});

test("the feed lists one entry per event, at its next occurrence", () => {
  // A recurring meetup expands into many occurrences that all carry the base
  // event id, so listing them as-is took every slot in the feed with copies
  // of the same meetup and handed React duplicate keys.
  const occurrences = [
    { id: "a", startTime: new Date("2026-05-02T19:00:00.000Z") },
    { id: "a", startTime: new Date("2026-05-01T19:00:00.000Z") },
    { id: "b", startTime: new Date("2026-05-03T19:00:00.000Z") },
  ];
  const next = nextOccurrences(occurrences);
  assert.equal(next.length, 2);
  assert.deepEqual(
    next.map((event) => event.id),
    ["a", "b"]
  );
  assert.equal(next[0].startTime.toISOString(), "2026-05-01T19:00:00.000Z");
});

test("the limit defaults to six instead of one", () => {
  // Number(null) is 0, so a missing limit parameter used to fall through to
  // the clamp floor of 1 and the feed returned a single event.
  assert.equal(parsePublicLimit(null), 6);
  assert.equal(parsePublicLimit(undefined), 6);
  assert.equal(parsePublicLimit(""), 6);
  assert.equal(parsePublicLimit("not-a-number"), 6);
  assert.equal(parsePublicLimit("6"), 6);
  assert.equal(parsePublicLimit("3"), 3);
  assert.equal(parsePublicLimit("0"), 1);
  assert.equal(parsePublicLimit("99"), 12);
});
