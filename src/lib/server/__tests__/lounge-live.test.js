import { test } from "node:test";
import assert from "node:assert/strict";
import { LIVE_ANNOUNCER_EMAIL, pickAnnouncerRoom } from "../lounge-live-core.js";

const OWNER = { id: "u1", email: "secretyarnery@gmail.com" };

test("the banner picks the room she is actually in", () => {
  const rows = [{ user: OWNER, room: { id: "r2", name: "The Velvet Den", status: "active" } }];
  assert.equal(pickAnnouncerRoom(rows).name, "The Velvet Den");
});

test("the banner follows her when she moves lounge", () => {
  const happy = { user: OWNER, room: { id: "r1", name: "Happy Hour Hub", status: "active" } };
  const velvet = { user: OWNER, room: { id: "r2", name: "The Velvet Den", status: "active" } };
  assert.equal(pickAnnouncerRoom([happy]).name, "Happy Hour Hub");
  assert.equal(pickAnnouncerRoom([velvet]).name, "The Velvet Den");
});

test("no banner when she is not in a lounge", () => {
  assert.equal(pickAnnouncerRoom([]), null);
  assert.equal(pickAnnouncerRoom(undefined), null);
});

test("no banner when the presence row belongs to someone else", () => {
  const rows = [
    { user: { id: "u9", email: "someone@example.com" }, room: { id: "r1", name: "Happy Hour Hub" } },
  ];
  assert.equal(pickAnnouncerRoom(rows), null);
});

test("no banner when her lounge has been deleted", () => {
  const rows = [{ user: OWNER, room: { id: "r1", name: "Happy Hour Hub", status: "deleted" } }];
  assert.equal(pickAnnouncerRoom(rows), null);
});

test("an ambiguous second row suppresses the banner rather than guessing", () => {
  const rows = [
    { user: OWNER, room: { id: "r1", name: "Happy Hour Hub", status: "active" } },
    { user: OWNER, room: { id: "r2", name: "The Velvet Den", status: "active" } },
  ];
  assert.equal(pickAnnouncerRoom(rows), null);
});

test("the banner owner match is case-insensitive", () => {
  const rows = [
    { user: { id: "u1", email: "Secretyarnery@Gmail.com" }, room: { id: "r1", name: "Happy Hour Hub" } },
  ];
  assert.equal(pickAnnouncerRoom(rows).id, "r1");
  assert.equal(LIVE_ANNOUNCER_EMAIL, "secretyarnery@gmail.com");
});
