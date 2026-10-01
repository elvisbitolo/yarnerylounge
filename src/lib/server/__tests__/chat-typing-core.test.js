import test from "node:test";
import assert from "node:assert/strict";
import {
  typingNamesFrom,
  typingLabel,
  TYPING_TTL_MS,
} from "../../chat-typing-core.js";

const NOW = 1_000_000;

test("typingLabel: empty yields empty string", () => {
  assert.equal(typingLabel([]), "");
  assert.equal(typingLabel(null), "");
});

test("typingLabel: one name", () => {
  assert.equal(typingLabel(["Donna"]), "Donna is typing…");
});

test("typingLabel: two names", () => {
  assert.equal(typingLabel(["Donna", "Caro"]), "Donna and Caro are typing…");
});

test("typingLabel: three or more collapses to a count", () => {
  assert.equal(typingLabel(["Donna", "Caro", "Ana"]), "3 people are typing…");
  assert.equal(typingLabel(["a", "b", "c", "d"]), "4 people are typing…");
});

test("typingLabel: de-duplicates and drops blanks", () => {
  assert.equal(typingLabel(["Donna", "Donna"]), "Donna is typing…");
  assert.equal(typingLabel(["Donna", "", null]), "Donna is typing…");
});

test("typingNamesFrom: excludes self and stale senders", () => {
  const entries = [
    { userId: "me", name: "Me", at: NOW - 100 },
    { userId: "a", name: "Donna", at: NOW - 100 },
    { userId: "b", name: "Caro", at: NOW - TYPING_TTL_MS - 1 },
    { userId: "c", name: "Ana", at: NOW - TYPING_TTL_MS + 1 },
  ];
  assert.deepEqual(typingNamesFrom(entries, { uid: "me", now: NOW }), ["Donna", "Ana"]);
});

test("typingNamesFrom: tolerates junk entries", () => {
  assert.deepEqual(typingNamesFrom([null, "x", { userId: "a" }], { uid: "me", now: NOW }), []);
  assert.deepEqual(typingNamesFrom(null, { uid: "me", now: NOW }), []);
});

test("typingNamesFrom: a name is required", () => {
  assert.deepEqual(
    typingNamesFrom([{ userId: "a", name: "", at: NOW }], { uid: "me", now: NOW }),
    []
  );
});
