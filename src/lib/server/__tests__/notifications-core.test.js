import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { notificationRow } from "../notifications-core.js";

// Notification.actorId is a foreign key to User(id). An empty string is not a
// valid actor, so an insert with one is rejected by Postgres and the
// notification is lost - createNotification() swallows the error, so the loss
// is silent. Every notification written without an actor used to disappear
// this way: the re-engagement nudges, the event reminders, the daily match,
// the invite receipts and the automation messages.
test("an actor-less notification stores a null actor, never an empty string", () => {
  const row = notificationRow({ userId: "u1", type: "daily_match", text: "hi" });
  assert.equal(row.actorId, null);
});

test("an empty actor is normalised to null", () => {
  const row = notificationRow({ userId: "u1", type: "event_reminder", actorId: "", text: "hi" });
  assert.equal(row.actorId, null);
});

// The platform still speaks for itself, it just does so with a byline instead
// of a member record.
test("the platform byline survives without a service account", () => {
  const row = notificationRow({
    userId: "u1",
    type: "automation",
    actorId: null,
    actorName: "The Speakeasy Team",
    text: "Welcome!",
  });
  assert.equal(row.actorId, null);
  assert.equal(row.actorName, "The Speakeasy Team");
});

test("a real actor is kept as-is", () => {
  const row = notificationRow({
    userId: "u1",
    type: "like",
    actorId: "abc-123",
    actorName: "Ada",
    text: "liked your post",
  });
  assert.equal(row.actorId, "abc-123");
  assert.equal(row.actorName, "Ada");
});

// The name is a display string and is allowed to be missing. The actor id is
// not: it has to stay either a real member id or null.
test("a missing name becomes an empty string but never invents an actor", () => {
  const row = notificationRow({ userId: "u1", type: "invite", text: "hi" });
  assert.equal(row.actorName, "");
  assert.equal(row.actorId, null);
  assert.notEqual(row.actorId, "");
});

test("the row carries the fields the notification list renders", () => {
  const createdAt = new Date("2026-01-02T03:04:05.000Z");
  const row = notificationRow({
    userId: "u1",
    type: "like",
    actorId: "abc-123",
    actorName: "Ada",
    targetId: "post-1",
    href: "/feed",
    text: "liked your post",
    createdAt,
  });
  assert.equal(row.userId, "u1");
  assert.equal(row.type, "like");
  assert.equal(row.targetId, "post-1");
  assert.equal(row.href, "/feed");
  assert.equal(row.text, "liked your post");
  assert.equal(row.read, false);
  assert.equal(row.createdAt, createdAt);
});

test("targetId and href fall back to empty strings", () => {
  const row = notificationRow({ userId: "u1", type: "digest", text: "hi" });
  assert.equal(row.targetId, "");
  assert.equal(row.href, "");
});

// There is no service account. A notification that names one as its actor
// would fail the foreign key the moment that account is gone, and the
// notification would vanish without a trace - which is how the welcome
// message broke the first time this was tried.
function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      out.push(...sourceFiles(full));
    } else if (entry.name.endsWith(".js") && !entry.name.endsWith(".test.js")) {
      out.push(full);
    }
  }
  return out;
}

test("no notification is written with a service account as its actor", () => {
  const srcDir = fileURLToPath(new URL("../../../", import.meta.url));
  const offenders = [];
  for (const file of [...sourceFiles(`${srcDir}lib`), ...sourceFiles(`${srcDir}app`)]) {
    const body = readFileSync(file, "utf8");
    if (/actorId:\s*"system"/.test(body)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], "no source file may pass 'system' as a notification actor");
});
