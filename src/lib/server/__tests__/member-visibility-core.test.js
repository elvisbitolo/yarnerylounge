import { test } from "node:test";
import assert from "node:assert/strict";
import { NOT_SUSPENDED, notSuspendedRelation, withNotSuspended } from "../member-visibility-core.js";

// SQL three-valued logic: a comparison against NULL is UNKNOWN, and a WHERE
// clause keeps only the rows that evaluate to TRUE. This models just enough of
// Postgres to prove which rows each filter keeps.
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

  // "field IS NULL" — always TRUE or FALSE, never UNKNOWN.
  if (expected === null) {
    return isNull(actual) ? TRUE : FALSE;
  }

  // "field <> value" — UNKNOWN when the column is NULL.
  if (expected && typeof expected === "object" && "not" in expected) {
    if (isNull(actual)) return UNKNOWN;
    return actual === expected.not ? FALSE : TRUE;
  }

  if (isNull(actual)) return UNKNOWN;
  return actual === expected ? TRUE : FALSE;
}

// A row survives the filter only when it evaluates to TRUE.
function keeps(filter, row) {
  return evaluate(filter, row) === TRUE;
}

const SUSPENDED_TRUE = { suspended: true };
const SUSPENDED_FALSE = { suspended: false };
const SUSPENDED_NULL = { suspended: null };

test("the visibility rule keeps members who were never suspended", () => {
  assert.equal(keeps(NOT_SUSPENDED, SUSPENDED_NULL), true);
  assert.equal(keeps(NOT_SUSPENDED, SUSPENDED_FALSE), true);
});

test("the visibility rule hides suspended members", () => {
  assert.equal(keeps(NOT_SUSPENDED, SUSPENDED_TRUE), false);
});

test("the old filters dropped every member whose flag was never set", () => {
  // The regression this guards: "suspended <> true" is UNKNOWN for a NULL
  // column, so the member was filtered out of every list.
  assert.equal(evaluate({ suspended: { not: true } }, SUSPENDED_NULL), UNKNOWN);
  assert.equal(evaluate({ NOT: { suspended: true } }, SUSPENDED_NULL), UNKNOWN);
});

test("the rule combines with other conditions", () => {
  const filter = withNotSuspended({ id: { not: "someone" } });
  assert.equal(keeps(filter, { ...SUSPENDED_NULL, id: "me" }), true);
  assert.equal(keeps(filter, { ...SUSPENDED_TRUE, id: "me" }), false);
});

test("the rule combines with an OR of its own", () => {
  const filter = withNotSuspended({ OR: [{ name: "Elena" }, { username: "elena" }] });
  assert.equal(keeps(filter, { ...SUSPENDED_NULL, name: "Elena" }), true);
  assert.equal(keeps(filter, { ...SUSPENDED_NULL, name: "Someone" }), false);
  assert.equal(keeps(filter, { ...SUSPENDED_TRUE, name: "Elena" }), false);
});

test("the relation form keeps the same members", () => {
  assert.equal(keeps(notSuspendedRelation(), SUSPENDED_NULL), true);
  assert.equal(keeps(notSuspendedRelation(), SUSPENDED_TRUE), false);
});

test("the rule never regresses to a null-unsafe comparison", () => {
  const serialized = JSON.stringify(NOT_SUSPENDED);
  assert.ok(!serialized.includes('"not"'), "must not use the null-unsafe { not: true } filter");
  assert.ok(!serialized.includes('"NOT"'), "must not use the null-unsafe NOT filter");
  assert.ok(serialized.includes("null"), "must match the null state explicitly");
});
