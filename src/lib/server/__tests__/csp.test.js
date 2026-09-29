import test from "node:test";
import assert from "node:assert/strict";
import { buildCspHeader } from "../csp.js";

// Parse a single directive out of a policy string.
function directive(policy, name) {
  const found = policy
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `) || d === name);
  return found ? found.split(/\s+/).slice(1) : null;
}

const prod = buildCspHeader({ isDev: false });

test("csp: media-src allows Supabase storage, or <video> is blocked", () => {
  // Regression: the policy had no media-src, so <video> fell back to
  // default-src 'self' and every recording failed to load with
  // MEDIA_ERR_SRC_NOT_SUPPORTED and only a console warning to show for it.
  // connect-src already allowed Supabase, which governs fetch/XHR, not media.
  const media = directive(prod, "media-src");
  assert.ok(media, "media-src directive must exist");
  assert.ok(media.includes("'self'"), "media-src must keep same-origin media");
  assert.ok(
    media.includes("https://*.supabase.co"),
    "media-src must allow the Supabase storage host for signed playback URLs"
  );
});

test("csp: media-src allows blob: for object URLs", () => {
  assert.ok(directive(prod, "media-src").includes("blob:"));
});

test("csp: production does not ship unsafe-eval", () => {
  assert.ok(!directive(prod, "script-src").includes("'unsafe-eval'"));
});

test("csp: development allows unsafe-eval for the dev overlay", () => {
  assert.ok(directive(buildCspHeader({ isDev: true }), "script-src").includes("'unsafe-eval'"));
});

test("csp: hardening directives survive", () => {
  assert.deepEqual(directive(prod, "object-src"), ["'none'"]);
  assert.deepEqual(directive(prod, "base-uri"), ["'self'"]);
  assert.deepEqual(directive(prod, "form-action"), ["'self'"]);
  assert.deepEqual(directive(prod, "frame-ancestors"), ["'none'"]);
  assert.deepEqual(directive(prod, "default-src"), ["'self'"]);
});

test("csp: 8x8 is still embeddable in an iframe", () => {
  const frame = directive(prod, "frame-src");
  assert.ok(frame.includes("https://*.8x8.vc"));
});

test("csp: realtime websocket still allowed", () => {
  const connect = directive(prod, "connect-src");
  assert.ok(connect.includes("wss://*.supabase.co"));
  assert.ok(connect.includes("https://api.bigdatacloud.net"));
});

test("csp: emits a single line with no stray whitespace", () => {
  assert.ok(!/\n|\s{2,}/.test(prod), "header must be a single normalised line");
});
