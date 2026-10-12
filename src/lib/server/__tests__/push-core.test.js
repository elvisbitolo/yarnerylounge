import test from "node:test";
import assert from "node:assert/strict";
import { buildPushPayload, DEFAULT_PUSH_TITLE } from "../push-core.js";

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
  assert.equal(buildPushPayload({ href: "https://evil.example" }).url, "/");
  assert.equal(buildPushPayload({ href: "javascript:alert(1)" }).url, "/");
  assert.equal(buildPushPayload({ href: "" }).url, "/");
});
