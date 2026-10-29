import test from "node:test";
import assert from "node:assert/strict";
import { buildPushPayload, pushMessageJson, DEFAULT_PUSH_TITLE } from "../push-core.js";

test("buildPushPayload: actor name becomes the title", () => {
  const payload = buildPushPayload({ actorName: "Ada", text: "commented on your post", href: "/feed/1" });
  assert.deepEqual(payload, { title: "Ada", body: "commented on your post", url: "/feed/1" });
});

test("buildPushPayload: falls back to the brand title when there is no actor", () => {
  const payload = buildPushPayload({ text: "Your new fiber match is ready." });
  assert.equal(payload.title, DEFAULT_PUSH_TITLE);
  assert.equal(payload.body, "Your new fiber match is ready.");
  assert.equal(payload.url, "/");
});

test("buildPushPayload: trims and blanks are safe", () => {
  assert.equal(buildPushPayload({ actorName: "   ", text: "  hi  " }).title, DEFAULT_PUSH_TITLE);
  assert.equal(buildPushPayload({ actorName: "Ada", text: "  hi  " }).body, "hi");
  assert.deepEqual(buildPushPayload(), { title: DEFAULT_PUSH_TITLE, body: "", url: "/" });
});

test("buildPushPayload: only same-origin paths are used as the url", () => {
  assert.equal(buildPushPayload({ href: "/match" }).url, "/match");
  assert.equal(buildPushPayload({ href: "/feed?q=stitch#latest" }).url, "/feed?q=stitch#latest");
  for (const href of [
    "https://evil.example",
    "//evil.example/path",
    "/\\\\evil.example/path",
    "javascript:alert(1)",
    "",
    "/feed\nLocation: https://evil.example",
  ]) {
    assert.equal(buildPushPayload({ href }).url, "/", `expected unsafe href to be rejected: ${JSON.stringify(href)}`);
  }
});

// The service worker puts this number on the app icon, so it has to survive the
// JSON round-trip and never be a nonsense or negative count.
test("pushMessageJson: carries the unread count as the icon badge", () => {
  const payload = JSON.parse(pushMessageJson({ title: "Ada", body: "hi", url: "/feed", badge: 2 }));
  assert.deepEqual(payload, { title: "Ada", body: "hi", url: "/feed", badge: 2 });
});

test("pushMessageJson: no unread means no badge", () => {
  assert.equal(JSON.parse(pushMessageJson({ title: "Ada", badge: 0 })).badge, 0);
  assert.equal(JSON.parse(pushMessageJson({ title: "Ada" })).badge, 0);
});

test("pushMessageJson: unsafe destinations are normalised", () => {
  assert.equal(JSON.parse(pushMessageJson({ title: "Ada", url: "//evil.example" })).url, "/");
});

test("pushMessageJson: nonsense counts collapse to zero", () => {
  for (const badge of [-3, NaN, Infinity, "abc", null, undefined]) {
    assert.equal(JSON.parse(pushMessageJson({ title: "Ada", badge })).badge, 0);
  }
});

test("pushMessageJson: fractions are truncated and huge counts capped", () => {
  assert.equal(JSON.parse(pushMessageJson({ title: "Ada", badge: 2.9 })).badge, 2);
  assert.equal(JSON.parse(pushMessageJson({ title: "Ada", badge: "7" })).badge, 7);
  assert.equal(JSON.parse(pushMessageJson({ title: "Ada", badge: 1e9 })).badge, 9999);
});
