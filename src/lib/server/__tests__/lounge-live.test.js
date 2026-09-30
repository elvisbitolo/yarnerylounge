import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIVE_ANNOUNCER_EMAIL,
  LIVE_COOLDOWN_MS,
  LIVE_PRESENCE_GRACE_MS,
  buildLiveEmail,
  buildLiveMessage,
  isLoungeLiveEnabled,
  isLiveAnnouncer,
  selectRecipients,
  shouldAnnounce,
} from "../lounge-live-core.js";

const CHRIS = { id: "u1", email: "secretyarnery@gmail.com" };
const ROOM = { name: "Happy Hour Hub" };

// ------------------------------------------------------------- enablement

test("lounge live is on unless the kill switch is set", () => {
  const before = process.env.LOUNGE_LIVE_NOTIFY;
  delete process.env.LOUNGE_LIVE_NOTIFY;
  assert.equal(isLoungeLiveEnabled(), true);

  process.env.LOUNGE_LIVE_NOTIFY = "off";
  assert.equal(isLoungeLiveEnabled(), false);

  // Any other value, including a typo, leaves it enabled.
  process.env.LOUNGE_LIVE_NOTIFY = "on";
  assert.equal(isLoungeLiveEnabled(), true);

  if (before === undefined) delete process.env.LOUNGE_LIVE_NOTIFY;
  else process.env.LOUNGE_LIVE_NOTIFY = before;
});

// -------------------------------------------------------------- announcer

test("only the announcer's own account is announced", () => {
  assert.equal(isLiveAnnouncer(CHRIS), true);
  assert.equal(isLiveAnnouncer({ id: "u2", email: "someone.else@example.com" }), false);
  assert.equal(isLiveAnnouncer({ id: "u3" }), false);
  assert.equal(isLiveAnnouncer(null), false);
});

test("the announcer match ignores case and surrounding whitespace", () => {
  assert.equal(isLiveAnnouncer({ email: "  Secretyarnery@Gmail.COM  " }), true);
  assert.equal(LIVE_ANNOUNCER_EMAIL, "secretyarnery@gmail.com");
});

test("a lookalike address is not the announcer", () => {
  assert.equal(isLiveAnnouncer({ email: "secretyarnery@gmail.com.evil.example" }), false);
  assert.equal(isLiveAnnouncer({ email: "notsecretyarnery@gmail.com" }), false);
});

// ----------------------------------------------------------------- message

test("the announcement names her and the room she is actually in", () => {
  assert.equal(buildLiveMessage("Happy Hour Hub"), "Christa is live in Happy Hour Hub");
  assert.equal(buildLiveMessage("The Velvet Den"), "Christa is live in The Velvet Den");
  // Every lounge reads correctly, not just the one it was built for.
  assert.equal(buildLiveMessage("The Silent Studio"), "Christa is live in The Silent Studio");
  assert.equal(buildLiveMessage("Lo-Fi & Loops"), "Christa is live in Lo-Fi & Loops");
});

test("a blank room name still produces a readable sentence", () => {
  assert.equal(buildLiveMessage(""), "Christa is live in a lounge");
  assert.equal(buildLiveMessage(undefined), "Christa is live in a lounge");
});

test("the email carries a link to the lounge she joined", () => {
  const mail = buildLiveEmail({
    roomName: "Happy Hour Hub",
    roomSlug: "happy-hour-hub",
    appUrl: "https://www.christa-speakeasy.com",
  });
  assert.equal(mail.subject, "Christa is live in Happy Hour Hub");
  assert.match(mail.text, /Join her: https:\/\/www\.christa-speakeasy\.com\/rooms\/happy-hour-hub/);
});

test("the email degrades without a configured app URL", () => {
  const mail = buildLiveEmail({ roomName: "The Velvet Den", roomSlug: "velvet-den", appUrl: "" });
  assert.equal(mail.subject, "Christa is live in The Velvet Den");
  assert.doesNotMatch(mail.text, /Join her: https/);
});

// ------------------------------------------------------------------ gating

test("a genuine arrival is announced", () => {
  const verdict = shouldAnnounce({ announcer: true, roomName: ROOM.name });
  assert.equal(verdict.announce, true);
  assert.equal(verdict.reason, "live");
});

test("the kill switch stops the broadcast", () => {
  const verdict = shouldAnnounce({ enabled: false, announcer: true, roomName: ROOM.name });
  assert.equal(verdict.announce, false);
  assert.equal(verdict.reason, "disabled");
});

test("nobody else triggers a broadcast", () => {
  const verdict = shouldAnnounce({ announcer: false, roomName: ROOM.name });
  assert.equal(verdict.announce, false);
  assert.equal(verdict.reason, "not_announcer");
});

test("a refresh inside the cooldown is suppressed", () => {
  const verdict = shouldAnnounce({ announcer: true, roomName: ROOM.name, recentJoin: true });
  assert.equal(verdict.announce, false);
  assert.equal(verdict.reason, "cooldown");
  assert.equal(verdict.cooldownMs, LIVE_COOLDOWN_MS);
});

test("a reconnect while still present is suppressed before the cooldown is consulted", () => {
  const verdict = shouldAnnounce({
    announcer: true,
    roomName: ROOM.name,
    wasRecentlyPresent: true,
    recentJoin: true,
  });
  assert.equal(verdict.reason, "already_present");
});

test("a room with no name is never announced", () => {
  assert.equal(shouldAnnounce({ announcer: true, roomName: "" }).reason, "no_room");
  assert.equal(shouldAnnounce({ announcer: true, roomName: "   " }).reason, "no_room");
});

test("the cooldown is ten minutes and outlasts the presence window", () => {
  assert.equal(LIVE_COOLDOWN_MS, 10 * 60 * 1000);
  assert.ok(LIVE_PRESENCE_GRACE_MS >= 90_000);
});

// -------------------------------------------------------------- recipients

test("every active member except her is notified", () => {
  const users = [
    { id: "u1", email: CHRIS.email },
    { id: "u2", email: "a@example.com" },
    { id: "u3", email: "b@example.com" },
  ];
  const out = selectRecipients(users, "u1");
  assert.deepEqual(
    out.map((u) => u.id),
    ["u2", "u3"]
  );
});

test("suspended members are excluded", () => {
  const users = [
    { id: "u1", email: CHRIS.email },
    { id: "u2", email: "a@example.com" },
    { id: "u3", email: "b@example.com", suspended: true },
  ];
  const out = selectRecipients(users, "u1");
  assert.deepEqual(
    out.map((u) => u.id),
    ["u2"]
  );
});

test("a duplicate member id is only notified once", () => {
  const users = [{ id: "u2", email: "a@example.com" }, { id: "u2", email: "a@example.com" }];
  assert.equal(selectRecipients(users, "u1").length, 1);
});

test("rows without an id are dropped rather than notified as undefined", () => {
  const users = [{ email: "a@example.com" }, { id: "u2", email: "b@example.com" }];
  const out = selectRecipients(users, "u1");
  assert.deepEqual(
    out.map((u) => u.id),
    ["u2"]
  );
});

test("a non-array input yields no recipients instead of throwing", () => {
  assert.deepEqual(selectRecipients(undefined, "u1"), []);
  assert.deepEqual(selectRecipients(null, "u1"), []);
});
