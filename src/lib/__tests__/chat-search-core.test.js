import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHAT_SEARCH_MIN_QUERY,
  buildSnippet,
  hasSearchQuery,
  normalizeQuery,
  summarizeMatches,
} from "../chat-search-core.js";

test("normalizeQuery trims and lowercases", () => {
  assert.equal(normalizeQuery("  HeLLo  "), "hello");
  assert.equal(normalizeQuery(null), "");
  assert.equal(normalizeQuery(undefined), "");
});

test("hasSearchQuery waits for the minimum length", () => {
  assert.equal(hasSearchQuery(""), false);
  assert.equal(hasSearchQuery("a"), false);
  assert.equal(hasSearchQuery("ab"), true);
  assert.equal(hasSearchQuery("  aB  "), true);
  assert.equal(CHAT_SEARCH_MIN_QUERY, 2);
});

test("buildSnippet windows the first hit with ellipses", () => {
  const long = `${"x".repeat(60)} needle ${"y".repeat(60)}`;
  const snippet = buildSnippet(long, "needle", 10);
  assert.match(snippet, /needle/);
  assert.ok(snippet.startsWith("…"));
  assert.ok(snippet.endsWith("…"));
});

test("buildSnippet returns the whole short text when it fits", () => {
  assert.equal(buildSnippet("short message", "short", 40), "short message");
});

test("buildSnippet falls back to the head when the query is absent", () => {
  const snippet = buildSnippet("a".repeat(200), "zzz", 10);
  assert.ok(snippet.endsWith("…"));
  assert.ok(snippet.length < 200);
});

test("buildSnippet tolerates empty text", () => {
  assert.equal(buildSnippet("", "x"), "");
  assert.equal(buildSnippet(null, "x"), "");
});

test("summarizeMatches groups by conversation and counts every hit", () => {
  const messages = [
    { id: "m1", conversationId: "c1", senderId: "u1", text: "yarn talk", createdAt: 300 },
    { id: "m2", conversationId: "c1", senderId: "u2", text: "more YARN here", createdAt: 200 },
    { id: "m3", conversationId: "c2", senderId: "u1", text: "hooks", createdAt: 250 },
    { id: "m4", conversationId: "c2", senderId: "u2", text: "yarn again", createdAt: 100 },
  ];
  const out = summarizeMatches(messages, "yarn");
  assert.equal(out.length, 2);
  const c1 = out.find((s) => s.conversationId === "c1");
  assert.equal(c1.matchCount, 2);
  assert.equal(c1.lastMatchAt, 300);
  assert.equal(c1.snippets.length, 2);
  assert.equal(c1.snippets[0].id, "m1");
});

test("summarizeMatches orders conversations by most recent match", () => {
  const messages = [
    { id: "a", conversationId: "c1", text: "yarn", createdAt: 100 },
    { id: "b", conversationId: "c2", text: "yarn", createdAt: 900 },
  ];
  const out = summarizeMatches(messages, "yarn");
  assert.deepEqual(
    out.map((s) => s.conversationId),
    ["c2", "c1"]
  );
});

test("summarizeMatches is case-insensitive and ignores blanks", () => {
  const messages = [
    { id: "a", conversationId: "c1", text: "YaRn", createdAt: 1 },
    { id: "b", conversationId: "c1", text: "", createdAt: 2 },
    { id: "c", conversationId: "c1", text: "unrelated", createdAt: 3 },
    { id: "d", conversationId: "", text: "yarn", createdAt: 4 },
  ];
  const out = summarizeMatches(messages, "yarn");
  assert.equal(out.length, 1);
  assert.equal(out[0].matchCount, 1);
});

test("summarizeMatches caps snippets but keeps the full count", () => {
  const messages = Array.from({ length: 10 }, (_, i) => ({
    id: `m${i}`,
    conversationId: "c1",
    text: "yarn",
    createdAt: 1000 - i,
  }));
  const out = summarizeMatches(messages, "yarn", { snippetsPerConversation: 2 });
  assert.equal(out[0].matchCount, 10);
  assert.equal(out[0].snippets.length, 2);
});

test("summarizeMatches returns nothing without a query", () => {
  assert.deepEqual(summarizeMatches([{ conversationId: "c1", text: "yarn" }], ""), []);
  assert.deepEqual(summarizeMatches(null, "yarn"), []);
});
