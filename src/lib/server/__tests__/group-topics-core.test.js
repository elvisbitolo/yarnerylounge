import { test } from "node:test";
import assert from "node:assert/strict";
import {
  slugifyTopicKey,
  uniqueTopicKey,
  validateTopicDraft,
  nextTopicOrder,
  TOPIC_NAME_MAX,
} from "../group-topics-core.js";

test("slugifyTopicKey produces a url-safe key", () => {
  assert.equal(slugifyTopicKey("Amigurumi Help"), "amigurumi-help");
  assert.equal(slugifyTopicKey("  Sock Knitting  "), "sock-knitting");
  assert.equal(slugifyTopicKey("Café & Lace"), "cafe-lace");
});

test("slugifyTopicKey collapses punctuation and strips edge dashes", () => {
  assert.equal(slugifyTopicKey("!!!Hello___World!!!"), "hello-world");
  assert.equal(slugifyTopicKey("--dashes--"), "dashes");
});

test("slugifyTopicKey falls back when there is nothing to slug", () => {
  assert.equal(slugifyTopicKey("!!!"), "topic");
  assert.equal(slugifyTopicKey(""), "topic");
  assert.equal(slugifyTopicKey(undefined, "sub"), "sub");
});

test("slugifyTopicKey caps length and never ends on a dash", () => {
  const key = slugifyTopicKey("yarn ".repeat(40));
  assert.ok(key.length <= 40, `expected <=40 chars, got ${key.length}`);
  assert.ok(!key.endsWith("-"));
});

test("uniqueTopicKey keeps a free slug as-is", () => {
  assert.equal(uniqueTopicKey("Amigurumi Help", []), "amigurumi-help");
});

test("uniqueTopicKey suffixes on collision instead of throwing", () => {
  assert.equal(uniqueTopicKey("Pattern help", ["pattern-help"]), "pattern-help-2");
  assert.equal(
    uniqueTopicKey("Pattern help", ["pattern-help", "pattern-help-2"]),
    "pattern-help-3"
  );
});

test("uniqueTopicKey compares case-insensitively", () => {
  assert.equal(uniqueTopicKey("Pattern Help", ["PATTERN-HELP"]), "pattern-help-2");
});

test("validateTopicDraft rejects a missing or too-short name", () => {
  assert.equal(validateTopicDraft({ name: "" }).ok, false);
  assert.equal(validateTopicDraft({ name: "a" }).ok, false);
  assert.equal(validateTopicDraft({}).ok, false);
});

test("validateTopicDraft trims and normalises a good draft", () => {
  const r = validateTopicDraft({
    name: "  Amigurumi   Help  ",
    description: "  stuck  on  decreases ",
    emoji: "🧶",
  });
  assert.equal(r.ok, true);
  assert.equal(r.value.name, "Amigurumi Help");
  assert.equal(r.value.description, "stuck on decreases");
  assert.equal(r.value.emoji, "🧶");
});

test("validateTopicDraft strips control characters from the name", () => {
  const r = validateTopicDraft({ name: "Bad\u0000Name\u0007" });
  assert.equal(r.ok, true);
  assert.equal(r.value.name, "BadName");
});

test("validateTopicDraft caps the name length", () => {
  const r = validateTopicDraft({ name: "x".repeat(300) });
  assert.equal(r.ok, true);
  assert.equal(r.value.name.length, TOPIC_NAME_MAX);
});

test("validateTopicDraft defaults description and emoji to empty strings", () => {
  const r = validateTopicDraft({ name: "Quilting" });
  assert.equal(r.value.description, "");
  assert.equal(r.value.emoji, "");
});

test("nextTopicOrder puts a new sub-group after the last existing one", () => {
  assert.equal(nextTopicOrder([{ order: 0 }, { order: 1 }, { order: 2 }]), 3);
});

test("nextTopicOrder is 0 for an empty or unusable list", () => {
  assert.equal(nextTopicOrder([]), 0);
  assert.equal(nextTopicOrder(), 0);
  // Number(null) and Number("") are both 0, so these must not read as order 0.
  assert.equal(nextTopicOrder([{ order: null }, { order: "" }]), 0);
  assert.equal(nextTopicOrder([{ order: "x" }, {}]), 0);
});

test("nextTopicOrder ignores missing order fields and still advances", () => {
  assert.equal(nextTopicOrder([{ order: 5 }, {}]), 6);
});