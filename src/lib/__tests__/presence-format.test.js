import test from "node:test";
import assert from "node:assert/strict";
import { formatLastSeen } from "../presence-format.js";

const NOW = Date.parse("2026-10-12T12:00:00.000Z");
const at = (msAgo) => new Date(NOW - msAgo).toISOString();

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

test("formatLastSeen: empty for missing or malformed stamps", () => {
  assert.equal(formatLastSeen(null, NOW), "");
  assert.equal(formatLastSeen(undefined, NOW), "");
  assert.equal(formatLastSeen("not-a-date", NOW), "");
});

test("formatLastSeen: under a minute reads 'just now'", () => {
  assert.equal(formatLastSeen(at(5 * 1000), NOW), "just now");
  assert.equal(formatLastSeen(at(0), NOW), "just now");
});

test("formatLastSeen: minutes with singular/plural", () => {
  assert.equal(formatLastSeen(at(MINUTE), NOW), "1 minute ago");
  assert.equal(formatLastSeen(at(5 * MINUTE), NOW), "5 minutes ago");
  assert.equal(formatLastSeen(at(59 * MINUTE), NOW), "59 minutes ago");
});

test("formatLastSeen: hours with singular/plural", () => {
  assert.equal(formatLastSeen(at(HOUR), NOW), "1 hour ago");
  assert.equal(formatLastSeen(at(3 * HOUR), NOW), "3 hours ago");
});

test("formatLastSeen: yesterday and days", () => {
  assert.equal(formatLastSeen(at(DAY), NOW), "yesterday");
  assert.equal(formatLastSeen(at(4 * DAY), NOW), "4 days ago");
});

test("formatLastSeen: a week or more falls back to a short date", () => {
  const label = formatLastSeen(at(10 * DAY), NOW);
  assert.equal(label.includes("ago"), false);
  assert.match(label, /[A-Za-z]/);
});

test("formatLastSeen: accepts epoch millis", () => {
  assert.equal(formatLastSeen(NOW - 2 * HOUR, NOW), "2 hours ago");
});
