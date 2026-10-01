import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEventIcs,
  escapeIcsText,
  icsFilename,
  toIcsStamp,
} from "../../ics-core.js";

test("toIcsStamp: renders a UTC basic-format timestamp", () => {
  assert.equal(toIcsStamp("2026-10-01T12:30:45.000Z"), "20261001T123045Z");
});

test("toIcsStamp: returns empty for an invalid instant", () => {
  assert.equal(toIcsStamp("not-a-date"), "");
});

test("escapeIcsText: escapes the RFC 5545 special characters", () => {
  assert.equal(escapeIcsText("a, b; c\\d\ne"), "a\\, b\\; c\\\\d\\ne");
});

test("buildEventIcs: emits one event with the expected fields", () => {
  const ics = buildEventIcs({
    id: "evt-1",
    title: "Stitch & Bitch",
    description: "Bring your WIP",
    startTime: "2026-10-01T15:00:00.000Z",
    endTime: "2026-10-01T17:00:00.000Z",
    roomName: "Happy Hour Hub",
    url: "https://example.com/rooms/happy-hour-hub",
    now: "2026-09-30T00:00:00.000Z",
  });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /\r\nEND:VCALENDAR\r\n$/);
  assert.ok(ics.includes("UID:evt-1@secretyarnery"));
  assert.ok(ics.includes("DTSTART:20261001T150000Z"));
  assert.ok(ics.includes("DTEND:20261001T170000Z"));
  assert.ok(ics.includes("SUMMARY:Stitch & Bitch"));
  assert.ok(ics.includes("LOCATION:Happy Hour Hub"));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
});

test("buildEventIcs: falls back to the start when there is no end", () => {
  const ics = buildEventIcs({
    id: "evt-2",
    title: "Pop-up",
    startTime: "2026-10-01T15:00:00.000Z",
    now: "2026-09-30T00:00:00.000Z",
  });
  assert.ok(ics.includes("DTEND:20261001T150000Z"));
  assert.ok(!ics.includes("DESCRIPTION:"));
});

test("buildEventIcs: returns empty when the start is missing", () => {
  assert.equal(buildEventIcs({ title: "No date" }), "");
});

test("buildEventIcs: folds long description lines", () => {
  const ics = buildEventIcs({
    id: "evt-3",
    title: "Long one",
    description: "x".repeat(200),
    startTime: "2026-10-01T15:00:00.000Z",
    now: "2026-09-30T00:00:00.000Z",
  });
  const descriptionLine = ics
    .split("\r\n")
    .find((line) => line.startsWith("DESCRIPTION:"));
  assert.ok(descriptionLine.length <= 75);
});

test("icsFilename: slugifies a title", () => {
  assert.equal(icsFilename("Stitch & Bitch!"), "stitch-bitch.ics");
  assert.equal(icsFilename(""), "event.ics");
});
