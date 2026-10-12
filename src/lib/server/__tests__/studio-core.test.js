import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_STUDIO_ADMIN_EMAILS,
  buildStudioPosterPath,
  buildStudioVideoPath,
  isStudioAdminEmail,
  normalizeStudioVideo,
  parseStudioAdminEmails,
  parseStudioManifest,
  serializeStudioManifest,
  sortStudioVideos,
} from "../studio-core.js";

test("parseStudioAdminEmails: falls back to the built-in allowlist", () => {
  assert.deepEqual(parseStudioAdminEmails(""), DEFAULT_STUDIO_ADMIN_EMAILS);
  assert.deepEqual(parseStudioAdminEmails("   "), DEFAULT_STUDIO_ADMIN_EMAILS);
  assert.deepEqual(parseStudioAdminEmails(undefined), DEFAULT_STUDIO_ADMIN_EMAILS);
});

test("parseStudioAdminEmails: splits and normalizes a configured list", () => {
  assert.deepEqual(parseStudioAdminEmails("A@x.com, b@x.com;c@x.com d@x.com"), [
    "a@x.com",
    "b@x.com",
    "c@x.com",
    "d@x.com",
  ]);
});

test("isStudioAdminEmail: case-insensitive and exact", () => {
  assert.equal(isStudioAdminEmail("SecretYarnery@gmail.com", DEFAULT_STUDIO_ADMIN_EMAILS), true);
  assert.equal(isStudioAdminEmail("elvisbitolo11@gmail.com", DEFAULT_STUDIO_ADMIN_EMAILS), true);
  assert.equal(isStudioAdminEmail("stranger@example.com", DEFAULT_STUDIO_ADMIN_EMAILS), false);
  assert.equal(isStudioAdminEmail("", DEFAULT_STUDIO_ADMIN_EMAILS), false);
  assert.equal(isStudioAdminEmail(null, DEFAULT_STUDIO_ADMIN_EMAILS), false);
});

test("path builders: sanitize and pick an extension", () => {
  assert.equal(buildStudioVideoPath("abc-123", "video/mp4"), "studio/videos/abc-123/video.mp4");
  assert.equal(buildStudioVideoPath("abc-123", "video/webm"), "studio/videos/abc-123/video.webm");
  assert.equal(buildStudioPosterPath("abc-123", "image/png"), "studio/videos/abc-123/poster.png");
  assert.equal(buildStudioPosterPath("abc-123", "image/webp"), "studio/videos/abc-123/poster.webp");
  assert.equal(buildStudioPosterPath("abc-123", "image/jpeg"), "studio/videos/abc-123/poster.jpg");
  assert.equal(buildStudioVideoPath("../../etc", "video/mp4"), "studio/videos/etc/video.mp4");
  assert.equal(buildStudioVideoPath("", "video/mp4"), null);
});

test("normalizeStudioVideo: rejects unusable rows", () => {
  assert.equal(normalizeStudioVideo(null), null);
  assert.equal(normalizeStudioVideo({ id: "x" }), null);
  assert.equal(normalizeStudioVideo({ videoPath: "studio/videos/x/video.mp4" }), null);
});

test("normalizeStudioVideo: clamps and defaults", () => {
  const row = normalizeStudioVideo({
    id: "x",
    videoPath: "studio/videos/x/video.mp4",
    title: "   A   title  ",
    description: "  hi  ",
    durationSec: -5,
    width: 100000,
    height: "1280",
    sizeBytes: 1234.6,
    createdAt: "2026-01-02T03:04:05.000Z",
  });
  assert.equal(row.title, "A title");
  assert.equal(row.description, "hi");
  assert.equal(row.durationSec, 0);
  assert.equal(row.width, 8192);
  assert.equal(row.height, 1280);
  assert.equal(row.sizeBytes, 1235);
  assert.equal(row.mimeType, "video/mp4");
  assert.equal(row.createdAt, "2026-01-02T03:04:05.000Z");
});

test("parseStudioManifest: tolerates garbage and sorts newest first", () => {
  assert.deepEqual(parseStudioManifest("not json"), []);
  assert.deepEqual(parseStudioManifest("{}"), []);
  const rows = parseStudioManifest({
    videos: [
      { id: "a", videoPath: "studio/videos/a/video.mp4", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "b", videoPath: "studio/videos/b/video.mp4", createdAt: "2026-03-01T00:00:00.000Z" },
      { id: "c", videoPath: "studio/videos/c/video.mp4" },
      { nonsense: true },
    ],
  });
  assert.deepEqual(
    rows.map((row) => row.id),
    ["b", "a", "c"]
  );
});

test("serializeStudioManifest: round-trips through parse", () => {
  const input = [
    { id: "a", videoPath: "studio/videos/a/video.mp4", createdAt: "2026-01-01T00:00:00.000Z" },
  ];
  const parsed = parseStudioManifest(serializeStudioManifest(input));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, "a");
});

test("sortStudioVideos: does not mutate its input", () => {
  const input = [
    { id: "a", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "b", createdAt: "2026-02-01T00:00:00.000Z" },
  ];
  const sorted = sortStudioVideos(input);
  assert.equal(input[0].id, "a");
  assert.equal(sorted[0].id, "b");
});
