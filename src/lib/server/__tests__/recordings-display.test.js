import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultRecordingTitle,
  formatBytes,
  formatDuration,
  formatRecordingDate,
} from "../../recordings-display.js";

test("formatDuration: renders minutes and seconds", () => {
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(9), "0:09");
  assert.equal(formatDuration(247), "4:07");
  assert.equal(formatDuration(599), "9:59");
});

test("formatDuration: adds an hours component past 3600s", () => {
  assert.equal(formatDuration(3600), "1:00:00");
  assert.equal(formatDuration(3723), "1:02:03");
});

test("formatDuration: treats a missing or junk length as zero", () => {
  assert.equal(formatDuration(null), "0:00");
  assert.equal(formatDuration(undefined), "0:00");
  assert.equal(formatDuration("abc"), "0:00");
  assert.equal(formatDuration(-5), "0:00");
});

test("formatBytes: renders each magnitude", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(5 * 1024 * 1024), "5.0 MB");
  assert.equal(formatBytes(900 * 1024 * 1024), "900 MB");
  assert.equal(formatBytes(3 * 1024 ** 3), "3.0 GB");
});

test("formatBytes: returns empty for an unknown size", () => {
  // A recording whose size we never learned must render as nothing, not "0 B".
  assert.equal(formatBytes(null), "");
  assert.equal(formatBytes(0), "");
  assert.equal(formatBytes(undefined), "");
});

test("formatRecordingDate: formats a valid ISO date", () => {
  assert.ok(formatRecordingDate("2026-03-01T10:00:00.000Z"));
});

test("formatRecordingDate: returns null for missing or invalid input", () => {
  assert.equal(formatRecordingDate(null), null);
  assert.equal(formatRecordingDate(""), null);
  assert.equal(formatRecordingDate("not-a-date"), null);
});

test("defaultRecordingTitle: combines the room and the date", () => {
  const title = defaultRecordingTitle({
    roomName: "Happy Hour Hub",
    startedAt: new Date("2026-03-01T10:00:00.000Z"),
    now: new Date("2026-03-02T10:00:00.000Z"),
  });
  assert.ok(title.startsWith("Happy Hour Hub"));
  assert.ok(/1 Mar/.test(title));
});

test("defaultRecordingTitle: omits the year for a session this year", () => {
  const now = new Date("2026-03-02T10:00:00.000Z");
  const title = defaultRecordingTitle({ roomName: "Lounge", startedAt: now, now });
  assert.ok(!/2026/.test(title));
});

test("defaultRecordingTitle: keeps the year for an older session", () => {
  const title = defaultRecordingTitle({
    roomName: "Lounge",
    startedAt: new Date("2024-03-01T10:00:00.000Z"),
    now: new Date("2026-03-02T10:00:00.000Z"),
  });
  assert.ok(/2024/.test(title));
});

test("defaultRecordingTitle: falls back when the room is unknown", () => {
  const title = defaultRecordingTitle({
    roomName: null,
    startedAt: new Date("2026-03-01T10:00:00.000Z"),
    now: new Date("2026-03-02T10:00:00.000Z"),
  });
  assert.ok(title.startsWith("Lounge recording"));
});

test("defaultRecordingTitle: falls back to now for a missing start time", () => {
  const now = new Date("2026-03-02T10:00:00.000Z");
  const title = defaultRecordingTitle({ roomName: "Lounge", startedAt: null, now });
  assert.ok(title.startsWith("Lounge"));
});

test("defaultRecordingTitle: tolerates being called with nothing", () => {
  assert.match(defaultRecordingTitle(), /^Lounge recording/);
});
