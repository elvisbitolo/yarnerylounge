import test from "node:test";
import assert from "node:assert/strict";
import {
  selectReengagementCandidates,
  buildReengagementEmail,
  buildWelcomeBackEmail,
  isAutomationEmailOptOut,
} from "../re-engagement-core.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-12T15:00:00.000Z");

function user(over = {}) {
  return {
    id: over.id || "u1",
    name: over.name || "Ada",
    email: over.email === undefined ? "ada@example.com" : over.email,
    suspended: over.suspended || false,
    notificationPreferences: over.notificationPreferences ?? null,
    extra: over.extra ?? {},
    sessions: over.sessions ?? [],
    createdAt: over.createdAt ?? new Date(NOW - 30 * DAY),
  };
}

test("select: a drifted-away member is a candidate", () => {
  const rows = [user({ extra: { lastActiveAt: new Date(NOW - 20 * DAY).toISOString() } })];
  assert.equal(selectReengagementCandidates(rows, { now: NOW }).length, 1);
  assert.equal(selectReengagementCandidates(rows, { now: NOW })[0].reengagementKind, "onboarding");
});

test("select: a member active yesterday is skipped using session lastSeenAt", () => {
  const rows = [user({ sessions: [{ lastSeenAt: new Date(NOW - DAY).toISOString() }] })];
  assert.equal(selectReengagementCandidates(rows, { now: NOW }).length, 0);
});

test("select: stale session activity overrides old account creation", () => {
  const rows = [user({ sessions: [{ lastSeenAt: new Date(NOW - 20 * DAY).toISOString() }] })];
  assert.equal(selectReengagementCandidates(rows, { now: NOW }).length, 1);
  assert.equal(selectReengagementCandidates(rows, { now: NOW })[0].reengagementKind, "returning");
});

test("select: a member with no activity falls back to account age", () => {
  const rows = [user({ createdAt: new Date(NOW - 30 * DAY), extra: {}, sessions: [] })];
  assert.equal(selectReengagementCandidates(rows, { now: NOW }).length, 1);
});

test("select: a too-new account is never nudged", () => {
  const rows = [user({ createdAt: new Date(NOW - DAY), extra: {}, sessions: [] })];
  assert.equal(selectReengagementCandidates(rows, { now: NOW }).length, 0);
});

test("select: the automations toggle opts a member out", () => {
  const rows = [user({ notificationPreferences: { automations: false }, extra: { lastActiveAt: new Date(NOW - 20 * DAY).toISOString() } })];
  assert.equal(selectReengagementCandidates(rows, { now: NOW }).length, 0);
});

test("select: the legacy weeklyDigest flag opts a member out", () => {
  const rows = [user({ extra: { lastActiveAt: new Date(NOW - 20 * DAY).toISOString(), emailPreferences: { weeklyDigest: false } })];
  assert.equal(selectReengagementCandidates(rows, { now: NOW }).length, 0);
});

test("select: a member nudged recently is not nudged again", () => {
  const rows = [user({ extra: { lastActiveAt: new Date(NOW - 40 * DAY).toISOString(), reengagementSentAt: new Date(NOW - 3 * DAY).toISOString() } })];
  assert.equal(selectReengagementCandidates(rows, { now: NOW }).length, 0);
});

test("select: a member nudged long ago is eligible again", () => {
  const rows = [user({ extra: { lastActiveAt: new Date(NOW - 60 * DAY).toISOString(), reengagementSentAt: new Date(NOW - 30 * DAY).toISOString() } })];
  assert.equal(selectReengagementCandidates(rows, { now: NOW }).length, 1);
});

test("select: suspended members are skipped but members without email can be notified", () => {
  const rows = [user({ suspended: true, extra: { lastActiveAt: new Date(NOW - 20 * DAY).toISOString() } }), user({ id: "u2", email: "", extra: { lastActiveAt: new Date(NOW - 20 * DAY).toISOString() } })];
  assert.equal(selectReengagementCandidates(rows, { now: NOW }).length, 1);
});

test("select: the per-run cap is applied", () => {
  const rows = Array.from({ length: 10 }, (_, i) => user({ id: `u${i}`, extra: { lastActiveAt: new Date(NOW - 20 * DAY).toISOString() } }));
  assert.equal(selectReengagementCandidates(rows, { now: NOW, limit: 3 }).length, 3);
});

test("isAutomationEmailOptOut: defaults to false", () => {
  assert.equal(isAutomationEmailOptOut(user()), false);
  assert.equal(isAutomationEmailOptOut(null), false);
});

test("buildReengagementEmail: includes event and correct links", () => {
  const { subject, text, html } = buildReengagementEmail({ name: "Bea", appUrl: "https://example.com/", nextEvent: { title: "Stitch Night", date: "Mon, Oct 19" } });
  assert.equal(subject, "We missed you at the Lounge");
  assert.match(text, /Hi Bea,/);
  assert.match(text, /https:\/\/example\.com\/feed/);
  assert.match(text, /Next up: Stitch Night \(Mon, Oct 19\)/);
  assert.match(html, /https:\/\/example\.com\/feed/);
  assert.match(html, /Stitch Night/);
});

test("buildReengagementEmail: escapes names", () => {
  const { text, html } = buildReengagementEmail({ name: "<b>Bo</b>", appUrl: "https://example.com" });
  assert.match(text, /Hi <b>Bo<\/b>,/);
  assert.match(html, /&lt;b&gt;Bo&lt;\/b&gt;/);
});

test("buildWelcomeBackEmail: has welcome CTA and opt-out guidance", () => {
  const { subject, text, html } = buildWelcomeBackEmail({ name: "Bea", appUrl: "https://example.com/" });
  assert.match(subject, /first visit/i);
  assert.match(text, /https:\/\/example\.com\/feed/);
  assert.match(html, /Explore the community/);
  assert.match(text, /Account > Notifications/);
});
