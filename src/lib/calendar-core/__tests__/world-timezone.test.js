import test from "node:test";
import assert from "node:assert/strict";
import {
  addCalendarDays,
  calendarMonthKey,
  calendarWeekday,
  dateForCalendarDay,
  dayKeyFor,
  formatClock,
  formatZoneOffset,
  zonedDateTimeToDate,
} from "../../calendar-core.js";

test("calendar day anchors keep the selected date across far-apart zones", () => {
  for (const zone of ["Pacific/Kiritimati", "America/Adak", "Africa/Nairobi", "Europe/London"]) {
    const day = dateForCalendarDay("2026-10-21", zone);
    assert.equal(dayKeyFor(day, zone), "2026-10-21", zone);
  }
});

test("adding calendar days preserves wall dates across daylight-saving transitions", () => {
  const before = dateForCalendarDay("2026-03-07", "America/New_York");
  const after = addCalendarDays(before, 1, "America/New_York");
  assert.equal(dayKeyFor(after, "America/New_York"), "2026-03-08");
  assert.equal(dayKeyFor(addCalendarDays(after, 1, "America/New_York"), "America/New_York"), "2026-03-09");
});

test("wall-clock event time resolves using the event zone's DST offset", () => {
  const event = zonedDateTimeToDate("2026-03-08", "09:00", "America/New_York");
  assert.equal(event.toISOString(), "2026-03-08T13:00:00.000Z");
  assert.equal(formatClock(event, "America/New_York"), "09:00");
  assert.equal(formatZoneOffset(event, "America/New_York"), "UTC-4");
});

test("month and weekday helpers use the selected zone", () => {
  const instant = new Date("2026-10-21T23:30:00.000Z");
  assert.equal(dayKeyFor(instant, "Pacific/Kiritimati"), "2026-10-22");
  assert.equal(calendarMonthKey(instant, "Pacific/Kiritimati"), "2026-10");
  assert.equal(calendarWeekday(dateForCalendarDay("2026-10-22", "Pacific/Kiritimati"), "Pacific/Kiritimati"), 4);
});
