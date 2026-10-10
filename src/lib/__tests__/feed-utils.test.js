const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  detectTrigger,
  normalizeTag,
  isValidTag,
  embedInfoForUrl,
} = require("./feed-utils");

test("detectTrigger reads an @ mention under the cursor", () => {
  const r = detectTrigger("hello @cha", 11);
  assert.equal(r.type, "mention");
  assert.equal(r.query, "cha");
});

test("detectTrigger reads a # tag under the cursor", () => {
  const r = detectTrigger("wip #crochet", 13);
  assert.equal(r.type, "tag");
  assert.equal(r.query, "crochet");
});

test("detectTrigger ignores the leading marker char in the query", () => {
  const r = detectTrigger("#", 1);
  assert.equal(r.type, "tag");
  assert.equal(r.query, "");
});

test("detectTrigger returns null without a token", () => {
  assert.equal(detectTrigger("just words", 6), null);
  assert.equal(detectTrigger("", 0), null);
});

test("detectTrigger handles mid-word and trailing tokens", () => {
  const mid = detectTrigger("a @b c", 4);
  assert.equal(mid.type, "mention");
  assert.equal(mid.query, "b");
  const tail = detectTrigger("see #yarn", 9);
  assert.equal(tail.type, "tag");
  assert.equal(tail.query, "yarn");
});

test("normalizeTag strips #, spaces and lowercases", () => {
  assert.equal(normalizeTag("#Crochet"), "crochet");
  assert.equal(normalizeTag("  #Win  "), "win");
  assert.equal(normalizeTag(""), "");
});

test("isValidTag accepts word tags and rejects junk", () => {
  assert.equal(isValidTag("crochet"), true);
  assert.equal(isValidTag("a_b1"), true);
  assert.equal(isValidTag("#tag"), false);
  assert.equal(isValidTag(""), false);
  assert.equal(isValidTag("a".repeat(51)), false);
});

test("embedInfoForUrl maps youtube watch to an embed iframe", () => {
  const e = embedInfoForUrl("https://www.youtube.com/watch?v=abc123XYZ");
  assert.equal(e.type, "youtube");
  assert.equal(e.embedUrl, "https://www.youtube.com/embed/abc123XYZ");
});

test("embedInfoForUrl maps youtu.be and shorts links", () => {
  assert.equal(embedInfoForUrl("https://youtu.be/abc123XYZ").embedUrl, "https://www.youtube.com/embed/abc123XYZ");
  assert.equal(embedInfoForUrl("https://www.youtube.com/shorts/ab1cdE2").embedUrl, "https://www.youtube.com/embed/ab1cdE2");
});

test("embedInfoForUrl maps vimeo ids", () => {
  const e = embedInfoForUrl("https://vimeo.com/11223344");
  assert.equal(e.type, "vimeo");
  assert.equal(e.embedUrl, "https://player.vimeo.com/video/11223344");
});

test("embedInfoForUrl keeps direct video files as native <video>", () => {
  const e = embedInfoForUrl("https://cdn.example.com/reel.mp4");
  assert.equal(e.type, "video");
  assert.equal(e.url, "https://cdn.example.com/reel.mp4");
});

test("embedInfoForUrl falls back to a link card", () => {
  const e = embedInfoForUrl("https://example.com/a-page");
  assert.equal(e.type, "link");
  assert.equal(e.host, "example.com");
});

test("embedInfoForUrl refuses garbage", () => {
  assert.equal(embedInfoForUrl("not a url").type, "link");
  assert.equal(embedInfoForUrl(null).type, "none");
});