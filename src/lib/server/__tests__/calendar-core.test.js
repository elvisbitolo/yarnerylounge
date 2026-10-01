import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MINUTES_PER_DAY,
  GRID_PX_PER_HOUR,
  GRID_PX_PER_MINUTE,
  blockGeometry,
  dayKeyFor,
  formatClock,
  hourLabels,
  minutesIntoDay,
  nowOffset,
  timeZoneDisplay,
  windowHeightPx,
  zonedParts,
} from "../../calendar-core.js";

// The bug: a 12:00 EAT event was labelled "12:00" but drawn on the 15:00 row.
// The two were computed separately and one used minutes where the grid expected
// pixels. These tests pin the invariant that label and position both descend
// from minutesIntoDay, so they cannot drift apart again.

const NAIROBI = "Africa/Nairobi"; // UTC+3, no DST
const NEW_YORK = "America/New_York";

test("grid geometry constants stay consistent", () => {
  assert.equal(GRID_PX_PER_MINUTE, GRID_PX_PER_HOUR / 60);
  assert.equal(MINUTES_PER_DAY, 1440);
});

test("minutesIntoDay: converts a UTC instant to the viewer's wall clock", () => {
  // 09:00 UTC is 12:00 in Nairobi.
  const noonEat = "2026-10-01T09:00:00.000Z";
  assert.equal(minutesIntoDay(noonEat, NAIROBI), 12 * 60);

  // The same instant is 05:00 in New York (EDT, UTC-4).
  assert.equal(minutesIntoDay(noonEat, NEW_YORK), 5 * 60);
});

test("minutesIntoDay: accepts Date and ISO string alike", () => {
  const iso = "2026-10-01T09:00:00.000Z";
  assert.equal(minutesIntoDay(new Date(iso), NAIROBI), minutesIntoDay(iso, NAIROBI));
});

test("zonedParts: normalises a 24-hour midnight to 0", () => {
  // Any instant just after local midnight must not produce hour 24.
  const p = zonedParts("2026-10-01T21:30:00.000Z", NAIROBI); // 00:30 EAT
  assert.equal(p.hour, 0);
  assert.equal(p.minute, 30);
});

test("formatClock: matches minutesIntoDay for the same instant", () => {
  const iso = "2026-10-01T09:00:00.000Z";
  assert.equal(formatClock(iso, NAIROBI), "12:00");
  assert.equal(formatClock(iso, NEW_YORK), "05:00");
});

test("formatClock: 12-hour is opt-in and the default stays 24-hour", () => {
  const iso = "2026-10-01T15:00:00.000Z"; // 18:00 EAT
  assert.equal(formatClock(iso, NAIROBI), "18:00");
  assert.match(formatClock(iso, NAIROBI, { hour12: true }), /6:00\s?PM/i);
});

// THE REGRESSION. A block's `top` must be pixels, and its labelled time must sit
// on the same row. This is the test that fails under getHours()*60.
test("blockGeometry: top in pixels agrees with the label's row", () => {
  const startAt = "2026-10-01T09:00:00.000Z"; // 12:00 EAT
  const g = blockGeometry({ startAt, timeZone: NAIROBI });

  // 12:00 → 720 minutes → 720 * 0.8 = 576px, which is row 12 at 48px/hour.
  assert.equal(g.top, 12 * GRID_PX_PER_HOUR);
  assert.equal(g.top, 576);

  // The old bug produced 720 (minutes used as pixels), i.e. row 15.
  assert.notEqual(g.top, 720);
  assert.notEqual(g.top / GRID_PX_PER_HOUR, 15);

  // The hour the block is drawn on equals the hour it is labelled with.
  const labelledHour = Number(formatClock(startAt, NAIROBI).slice(0, 2));
  assert.equal(g.top / GRID_PX_PER_HOUR, labelledHour);
});

test("blockGeometry: a 12:00 block is never on the 15:00 row", () => {
  const g = blockGeometry({
    startAt: "2026-10-01T09:00:00.000Z",
    timeZone: NAIROBI,
    windowStartMinutes: 8 * 60,
  });
  // Window starts at 08:00, so 12:00 is 4 hours in = 192px.
  assert.equal(g.top, 4 * GRID_PX_PER_HOUR);
  assert.equal(g.startMin, 12 * 60);
});

test("blockGeometry: height is duration in pixels", () => {
  const g = blockGeometry({
    startAt: "2026-10-01T09:00:00.000Z",
    endAt: "2026-10-01T10:00:00.000Z", // 60 min
    timeZone: NAIROBI,
  });
  assert.equal(g.durationMin, 60);
  assert.equal(g.height, GRID_PX_PER_HOUR);
});

test("blockGeometry: enforces a minimum tappable height", () => {
  const g = blockGeometry({
    startAt: "2026-10-01T09:00:00.000Z",
    endAt: "2026-10-01T09:05:00.000Z", // 5 min
    timeZone: NAIROBI,
  });
  assert.equal(g.durationMin, 30);
  assert.equal(g.height, 30 * GRID_PX_PER_MINUTE);
});

test("blockGeometry: a block crossing midnight keeps a positive height", () => {
  const g = blockGeometry({
    startAt: "2026-10-01T20:30:00.000Z", // 23:30 EAT
    endAt: "2026-10-01T21:30:00.000Z", // 00:30 EAT next day
    timeZone: NAIROBI,
  });
  assert.equal(g.startMin, 23 * 60 + 30);
  assert.equal(g.durationMin, 60);
  assert.equal(g.height, GRID_PX_PER_HOUR);
});

test("blockGeometry: no end falls back to the minimum", () => {
  const g = blockGeometry({ startAt: "2026-10-01T09:00:00.000Z", timeZone: NAIROBI });
  assert.equal(g.durationMin, 30);
});

test("blockGeometry: invalid input is null rather than NaN", () => {
  assert.equal(blockGeometry({ startAt: "not-a-date", timeZone: NAIROBI }), null);
});

test("dayKeyFor: names the viewer's day, not the UTC day", () => {
  // 22:00 UTC on Oct 1 is 01:00 on Oct 2 in Nairobi.
  const iso = "2026-10-01T22:00:00.000Z";
  assert.equal(dayKeyFor(iso, NAIROBI), "2026-10-02");
  assert.equal(dayKeyFor(iso, NEW_YORK), "2026-10-01");

  // This is precisely where toISOString().slice(0,10) was wrong.
  assert.notEqual(dayKeyFor(iso, NAIROBI), iso.slice(0, 10));
});

test("nowOffset: sits where its label says", () => {
  const now = "2026-10-01T09:00:00.000Z"; // 12:00 EAT
  assert.equal(nowOffset({ now, timeZone: NAIROBI }), 12 * GRID_PX_PER_HOUR);
  assert.equal(
    nowOffset({ now, timeZone: NAIROBI, windowStartMinutes: 8 * 60 }),
    4 * GRID_PX_PER_HOUR
  );
});

test("hourLabels: inclusive of both ends", () => {
  assert.deepEqual(hourLabels({ startHour: 8, endHour: 10 }), [
    "08:00",
    "09:00",
    "10:00",
  ]);
  assert.equal(hourLabels().length, 25); // 00:00 … 24:00 for a full-day axis
});

test("windowHeightPx: matches the row count", () => {
  assert.equal(windowHeightPx({ startHour: 8, endHour: 19 }), 11 * GRID_PX_PER_HOUR);
  assert.equal(windowHeightPx(), 24 * GRID_PX_PER_HOUR);
});

// A viewer in another region sees the same instant at their correct local time,
// and it lands on that row too.
test("a New York viewer sees the same instant on the right row", () => {
  const startAt = "2026-10-01T09:00:00.000Z";
  const g = blockGeometry({ startAt, timeZone: NEW_YORK });
  assert.equal(formatClock(startAt, NEW_YORK), "05:00");
  assert.equal(g.top / GRID_PX_PER_HOUR, 5);
});

test("DST is handled by the zone, not by arithmetic", () => {
  // US DST ends 2026-11-01; 13:00 UTC is 09:00 EDT before and 08:00 EST after.
  const before = minutesIntoDay("2026-10-30T13:00:00.000Z", NEW_YORK);
  const after = minutesIntoDay("2026-11-03T13:00:00.000Z", NEW_YORK);
  assert.equal(before, 9 * 60);
  assert.equal(after, 8 * 60);
});

test("timeZoneDisplay: names the city and shows an offset", () => {
  const nairobi = timeZoneDisplay(NAIROBI);
  assert.equal(nairobi.city, "Nairobi");
  assert.match(nairobi.offset, /GMT\+3/);

  const ny = timeZoneDisplay(NEW_YORK);
  assert.equal(ny.city, "New York");
  assert.match(ny.offset, /GMT-4|GMT-5/); // EDT or EST depending on the date
});

test("timeZoneDisplay: falls back when there is no zone", () => {
  assert.deepEqual(timeZoneDisplay(null), { city: "your time", offset: "" });
});
