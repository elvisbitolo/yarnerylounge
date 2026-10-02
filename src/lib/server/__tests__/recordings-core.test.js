import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  buildStoragePath,
  buildThumbnailPath,
  clampDimension,
  clampSize,
  extractMeetingName,
  findRoomByMeeting,
  isSourceExpired,
  normalizeMeetingKey,
  parseJaasSignature,
  parseRecordingUploaded,
  parseThumbnailDataUrl,
  serializeRecording,
  signJaasPayload,
  verifyJaasSignature,
} from "../recordings-core.js";

const SECRET = "whsec_test_secret";

// Mirrors the signature JaaS sends: t=<unix>,v1=<base64 HMAC of "<t>.<body>">
function sign(body, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const digest = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("base64");
  return { header: `t=${timestamp},v1=${digest}`, timestamp };
}

// ---------------------------------------------------------------- signatures

test("verifyJaasSignature: accepts a correctly signed body", () => {
  const body = JSON.stringify({ eventType: "RECORDING_UPLOADED" });
  const { header } = sign(body);
  assert.equal(verifyJaasSignature({ header, body, secret: SECRET }), true);
});

test("verifyJaasSignature: rejects a body edited after signing", () => {
  const { header } = sign(JSON.stringify({ share: false }));
  const tampered = JSON.stringify({ share: true });
  assert.equal(verifyJaasSignature({ header, body: tampered, secret: SECRET }), false);
});

test("verifyJaasSignature: rejects the wrong secret", () => {
  const body = "{}";
  const { header } = sign(body, "other_secret");
  assert.equal(verifyJaasSignature({ header, body, secret: SECRET }), false);
});

test("verifyJaasSignature: rejects a missing or malformed header", () => {
  assert.equal(verifyJaasSignature({ header: null, body: "{}", secret: SECRET }), false);
  assert.equal(verifyJaasSignature({ header: "garbage", body: "{}", secret: SECRET }), false);
});

test("verifyJaasSignature: rejects a replayed signature outside the tolerance", () => {
  const body = JSON.stringify({ eventType: "RECORDING_ENDED" });
  const stale = Math.floor(Date.now() / 1000) - 3600;
  const { header } = sign(body, SECRET, stale);
  assert.equal(verifyJaasSignature({ header, body, secret: SECRET }), false);
});

test("verifyJaasSignature: rejects when no secret is configured", () => {
  const { header } = sign("{}");
  assert.equal(verifyJaasSignature({ header, body: "{}", secret: "" }), false);
});

// Published test vector from 8x8's "Check the webhook signatures" doc. Pinning
// this catches a drift between our HMAC and 8x8's real signer that synthetic
// round-trips cannot: every other signature test signs with our own code, so
// they would all still pass if our format were subtly wrong.
test("verifyJaasSignature: matches the test vector published by 8x8", () => {
  const body =
    '{"eventType":"PARTICIPANT_JOINED","sessionId":"9a441d60-ceaf-4eba-b0a8-a7d940a76e1b",' +
    '"timestamp":1632490058278,"fqn":"vpaas-magic-cookie-96f0941768964ab380ed0fbada7a502f/' +
    'sampleappromanticshiftsstripas","idempotencyKey":"9e9e7420-562d-4659-8e22-44b9b22aaa49",' +
    '"customerId":"96f0941768964ab380ed0fbada7a502f",' +
    '"appId":"vpaas-magic-cookie-96f0941768964ab380ed0fbada7a502f","data":{"avatar":"",' +
    '"name":"Test User","id":"auth0|5f903d7a77f3b4006eb8e67d",' +
    '"participantJid":"fc1ea14a-9bca-4218-a563-8c627e803d56@8x8.vc","moderator":true,' +
    '"email":"test.user@company.com"}}';
  const secret = "whsec_9635df66714a4cf088ee9d0979dd3bf6";
  const header = "t=1632490060,v1=xlzqEojlh4qb21sQpXYsWgyK8x9HVpz+RQldsv18rV0=";

  assert.equal(signJaasPayload({ timestamp: "1632490060", body, secret }),
    "xlzqEojlh4qb21sQpXYsWgyK8x9HVpz+RQldsv18rV0=");
  // The vector is years old, so widen the tolerance to isolate the signature
  // from the replay window.
  assert.equal(verifyJaasSignature({ header, body, secret, toleranceSec: 1e9 }), true);
});

test("parseJaasSignature: reads timestamp and every v1 digest", () => {
  const parsed = parseJaasSignature("t=1700000000,v1=abc123,v1=def456");
  assert.equal(parsed.timestamp, "1700000000");
  assert.deepEqual(parsed.signatures, ["abc123", "def456"]);
});

test("parseJaasSignature: ignores unknown schemes so they cannot downgrade v1", () => {
  const parsed = parseJaasSignature("t=1700000000,v0=nope,v1=abc123");
  assert.deepEqual(parsed.signatures, ["abc123"]);
});

test("verifyJaasSignature: accepts a second matching v1 during secret rotation", () => {
  const body = "{}";
  const timestamp = Math.floor(Date.now() / 1000);
  const other = crypto.createHmac("sha256", "old_secret").update(`${timestamp}.${body}`).digest("base64");
  const mine = crypto.createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("base64");
  const header = `t=${timestamp},v1=${other},v1=${mine}`;
  assert.equal(verifyJaasSignature({ header, body, secret: SECRET }), true);
});

// ------------------------------------------------------------- meeting names

test("extractMeetingName: splits appId/room off the conference name", () => {
  assert.equal(
    extractMeetingName("1234567890abcdef/Yarnery-Lounge-Happy-Hour-Hub", "1234567890abcdef"),
    "Yarnery-Lounge-Happy-Hour-Hub",
  );
});

test("extractMeetingName: rejects an fqn with no appId prefix", () => {
  // Without the prefix the tenant cannot be confirmed, so fail closed rather
  // than trusting a bare conference name from the payload.
  assert.equal(extractMeetingName("Yarnery-Lounge-Happy-Hour-Hub", "1234567890abcdef"), "");
});

test("extractMeetingName: returns empty when the tenant does not match", () => {
  assert.equal(extractMeetingName("other-app/Yarnery-Lounge-Happy-Hour-Hub", "1234567890abcdef"), "");
});

test("extractMeetingName: returns empty for a malformed fqn", () => {
  assert.equal(extractMeetingName("", "123"), "");
  assert.equal(extractMeetingName("123/", "123"), "");
  assert.equal(extractMeetingName(null, "123"), "");
});

test("normalizeMeetingKey: strips the Lounge prefix and punctuation", () => {
  assert.equal(normalizeMeetingKey("Yarnery-Lounge-Happy-Hour-Hub"), "happyhourhub");
  assert.equal(normalizeMeetingKey("happy hour hub"), "happyhourhub");
  assert.equal(normalizeMeetingKey("  Happy Hour Hub  "), "happyhourhub");
});

test("normalizeMeetingKey: collapses a repeated prefix", () => {
  // Belt-and-braces: a doubly-prefixed name must still resolve to one room.
  assert.equal(normalizeMeetingKey("Yarnery-Lounge-Yarnery-Lounge-Happy-Hour-Hub"), "happyhourhub");
});

// -------------------------------------------------------------- room lookup

const ROOMS = [
  { id: "r1", name: "Happy Hour Hub", slug: "happy-hour-hub" },
  { id: "r2", name: "Lo-fi & Loops", slug: "lo-fi-and-loops" },
];

test("findRoomByMeeting: matches a prefixed conference name", () => {
  assert.equal(findRoomByMeeting(ROOMS, "Yarnery-Lounge-Happy-Hour-Hub")?.id, "r1");
});

test("findRoomByMeeting: matches a bare conference name", () => {
  assert.equal(findRoomByMeeting(ROOMS, "Happy Hour Hub")?.id, "r1");
});

test("findRoomByMeeting: matches on slug when the display name differs", () => {
  assert.equal(findRoomByMeeting(ROOMS, "Yarnery-Lounge-Lo-Fi-And-Loops")?.id, "r2");
});

test("findRoomByMeeting: returns null for an unknown room", () => {
  assert.equal(findRoomByMeeting(ROOMS, "Yarnery-Lounge-Somewhere-Else"), null);
});

test("findRoomByMeeting: returns null when there are no rooms", () => {
  assert.equal(findRoomByMeeting([], "Yarnery-Lounge-Happy-Hour-Hub"), null);
});

// ---------------------------------------------------------- uploaded payload

const START = Date.parse("2026-03-01T10:00:00.000Z");
const UPLOAD = Date.parse("2026-03-01T12:00:00.000Z"); // link issued 2h later

const UPLOADED = {
  eventType: "RECORDING_UPLOADED",
  idempotencyKey: "idem_1",
  timestamp: UPLOAD,
  sessionId: "sess_1",
  appId: "1234567890abcdef",
  fqn: "1234567890abcdef/Yarnery-Lounge-Happy-Hour-Hub",
  data: {
    preAuthenticatedLink: "https://example.test/file",
    recordingSessionId: "rec_1",
    startTimestamp: START,
    endTimestamp: START + 45 * 60 * 1000,
    durationSec: 45 * 60,
    share: true,
    initiatorId: "user_1",
    participants: [
      { id: "u1", name: "Grace" },
      { id: "u2", name: "Ada" },
      { name: "" },
      {},
    ],
  },
};

const OPTS = { appId: "1234567890abcdef" };

test("parseRecordingUploaded: extracts link, session and ids", () => {
  const parsed = parseRecordingUploaded(UPLOADED, OPTS);
  assert.equal(parsed.sourceLink, "https://example.test/file");
  assert.equal(parsed.jaasSessionId, "sess_1");
  assert.equal(parsed.jaasRecordingId, "rec_1");
  assert.equal(parsed.idempotencyKey, "idem_1");
  assert.equal(parsed.initiatorId, "user_1");
  assert.equal(parsed.share, true);
});

test("parseRecordingUploaded: recovers the conference name from the fqn", () => {
  const parsed = parseRecordingUploaded(UPLOADED, OPTS);
  assert.equal(parsed.roomName, "Yarnery-Lounge-Happy-Hour-Hub");
});

test("parseRecordingUploaded: keeps only participants with a name or id", () => {
  const parsed = parseRecordingUploaded(UPLOADED, OPTS);
  assert.deepEqual(parsed.participants, [
    { id: "u1", name: "Grace", avatar: "" },
    { id: "u2", name: "Ada", avatar: "" },
  ]);
});

test("parseRecordingUploaded: expires the link 24h from issue, not from meeting start", () => {
  const parsed = parseRecordingUploaded(UPLOADED, OPTS);
  // The meeting ran 45 minutes and finished before upload. Deriving the window
  // from startedAt would hand out 24h45m of retries against a 24h link, and
  // for a long meeting would expire the sweep part-way through it.
  assert.equal(parsed.sourceExpiresAt.getTime() - UPLOAD, 24 * 60 * 60 * 1000);
  assert.ok(parsed.sourceExpiresAt.getTime() > parsed.startedAt.getTime() + 24 * 60 * 60 * 1000);
});

test("parseRecordingUploaded: falls back to receivedAt when the payload has no timestamp", () => {
  const { timestamp, ...noTimestamp } = UPLOADED;
  const receivedAt = new Date("2026-03-02T09:00:00.000Z");
  const parsed = parseRecordingUploaded(noTimestamp, { ...OPTS, receivedAt });
  assert.equal(parsed.sourceExpiresAt.getTime() - receivedAt.getTime(), 24 * 60 * 60 * 1000);
});

test("parseRecordingUploaded: computes duration and end time from JaaS epoch fields", () => {
  const parsed = parseRecordingUploaded(UPLOADED, OPTS);
  assert.equal(parsed.durationSec, 45 * 60);
  assert.equal(parsed.startedAt.getTime(), START);
  assert.equal(parsed.endedAt.getTime(), START + 45 * 60 * 1000);
});

test("parseRecordingUploaded: returns null without a preAuthenticatedLink", () => {
  const parsed = parseRecordingUploaded({ ...UPLOADED, data: {} }, OPTS);
  assert.equal(parsed, null);
});

test("parseRecordingUploaded: tolerates a missing duration and empty participants", () => {
  const parsed = parseRecordingUploaded({ ...UPLOADED, data: { preAuthenticatedLink: "x" } }, OPTS);
  assert.equal(parsed.durationSec, null);
  assert.equal(parsed.startedAt, null);
  assert.deepEqual(parsed.participants, []);
  assert.equal(parsed.jaasRecordingId, null);
});

// ------------------------------------------------------------------- helpers

test("isSourceExpired: true past the deadline (Date and ISO string)", () => {
  assert.equal(isSourceExpired(new Date(Date.now() - 1000)), true);
  assert.equal(isSourceExpired(new Date(Date.now() - 1000).toISOString()), true);
});

test("isSourceExpired: false while the window is open", () => {
  assert.equal(isSourceExpired(new Date(Date.now() + 60_000)), false);
  assert.equal(isSourceExpired(new Date(Date.now() + 60_000).toISOString()), false);
});

test("isSourceExpired: true when the deadline is unknown", () => {
  // An unparseable deadline must fail closed, never "assume still valid".
  assert.equal(isSourceExpired(null), true);
  assert.equal(isSourceExpired("not-a-date"), true);
});

test("clampSize: reports no size when the header is absent", () => {
  assert.deepEqual(clampSize(NaN), { sizeBytes: null, sizeUnknown: false });
  assert.deepEqual(clampSize(0), { sizeBytes: null, sizeUnknown: false });
});

test("clampSize: stores a known size", () => {
  assert.deepEqual(clampSize(1024), { sizeBytes: 1024, sizeUnknown: false });
});

test("clampSize: clamps rather than overflowing a 32-bit column", () => {
  const result = clampSize(5_000_000_000);
  assert.equal(result.sizeBytes, 2147483647);
  assert.equal(result.sizeUnknown, true);
});

test("buildStoragePath: nests by month and embeds a sortable timestamp", () => {
  const path = buildStoragePath({ recordingId: "abc123", startedAt: new Date(START) });
  assert.equal(path, "2026/03/abc123-20260301T100000Z-video.mp4");
});

test("buildStoragePath: writes the transcript beside the recording", () => {
  const path = buildStoragePath({
    recordingId: "abc123",
    startedAt: new Date(START),
    kind: "transcript",
    ext: "vtt",
  });
  assert.equal(path, "2026/03/abc123-20260301T100000Z-transcript.vtt");
});

test("buildStoragePath: orders same-day recordings by start time", () => {
  const a = buildStoragePath({ recordingId: "a", startedAt: new Date(START) });
  const b = buildStoragePath({ recordingId: "b", startedAt: new Date(START + 60_000) });
  assert.ok(a < b);
});

test("buildStoragePath: never lets the id escape its folder", () => {
  const path = buildStoragePath({ recordingId: "../../etc/passwd", startedAt: null });
  assert.ok(!path.includes(".."));
  assert.ok(!path.includes("/etc/"));
});

test("buildStoragePath: falls back to now when the start time is unusable", () => {
  const path = buildStoragePath({ recordingId: "abc", startedAt: "nope" });
  assert.match(path, /^\d{4}\/\d{2}\/abc-\d{8}T\d{6}Z-video\.mp4$/);
});

// ------------------------------------------------------------- serialization

const ROW = {
  id: "rec_1",
  roomId: "room_1",
  roomName: "Happy Hour Hub",
  status: "ready",
  durationSec: 2700,
  sizeBytes: 1048576,
  sizeUnknown: false,
  participants: [{ id: "u1", name: "Grace" }],
  startedAt: new Date("2026-03-01T10:00:00.000Z"),
  endedAt: new Date("2026-03-01T10:45:00.000Z"),
  pulledAt: new Date("2026-03-01T12:00:00.000Z"),
  transcriptPath: "2026/03/rec_1-x-transcript.vtt",
  createdAt: new Date("2026-03-01T12:00:01.000Z"),
  sourceLink: "https://example.test/secret-link",
  lastError: "boom",
};

test("serializeRecording: never leaks the JaaS download credential", () => {
  const out = serializeRecording(ROW);
  assert.equal(out.sourceLink, undefined);
  assert.ok(!Object.keys(out).includes("sourceLink"));
});

test("serializeRecording: converts timestamps to ISO strings", () => {
  const out = serializeRecording(ROW);
  assert.equal(out.startedAt, "2026-03-01T10:00:00.000Z");
  assert.equal(out.endedAt, "2026-03-01T10:45:00.000Z");
  assert.equal(out.pulledAt, "2026-03-01T12:00:00.000Z");
});

test("serializeRecording: tolerates an invalid Date instead of throwing", () => {
  // `new Date(x).toISOString()` throws RangeError on a bad date, which would
  // take down the whole library page for one malformed row.
  const out = serializeRecording({ ...ROW, startedAt: new Date("nonsense") });
  assert.equal(out.startedAt, null);
  assert.equal(out.endedAt, "2026-03-01T10:45:00.000Z");
});

test("serializeRecording: normalises missing timestamps to null", () => {
  const out = serializeRecording({ ...ROW, startedAt: null, endedAt: undefined, pulledAt: null });
  assert.equal(out.startedAt, null);
  assert.equal(out.endedAt, null);
  assert.equal(out.pulledAt, null);
});

test("serializeRecording: reports transcript presence as a boolean", () => {
  assert.equal(serializeRecording(ROW).hasTranscript, true);
  assert.equal(serializeRecording({ ...ROW, transcriptPath: null }).hasTranscript, false);
});

test("serializeRecording: defaults non-array participants to an empty list", () => {
  assert.deepEqual(serializeRecording({ ...ROW, participants: null }).participants, []);
  assert.deepEqual(serializeRecording({ ...ROW, participants: undefined }).participants, []);
});

test("serializeRecording: falls back through title then roomName", () => {
  assert.equal(serializeRecording({ ...ROW, title: "" }).title, "Happy Hour Hub");
  assert.equal(serializeRecording({ ...ROW, title: "", roomName: null }).title, "Lounge recording");
});

test("serializeRecording: returns null for a missing row", () => {
  assert.equal(serializeRecording(null), null);
});

test("serializeRecording: exposes dimensions and thumbnail presence", () => {
  const out = serializeRecording({ ...ROW, width: 1080, height: 1920, thumbnailPath: "2026/03/x-thumb.jpg" });
  assert.equal(out.width, 1080);
  assert.equal(out.height, 1920);
  assert.equal(out.hasThumbnail, true);
});

test("serializeRecording: normalises missing media metadata", () => {
  const out = serializeRecording({ ...ROW, width: undefined, height: null, thumbnailPath: null });
  assert.equal(out.width, null);
  assert.equal(out.height, null);
  assert.equal(out.hasThumbnail, false);
});

// -------------------------------------------------------------- thumbnails

test("buildThumbnailPath: stores the poster beside the video", () => {
  const path = buildThumbnailPath({ recordingId: "abc123", startedAt: new Date(START) });
  assert.equal(path, "2026/03/abc123-20260301T100000Z-thumb.jpg");
});

test("clampDimension: rounds sane values and rejects junk", () => {
  assert.equal(clampDimension(1080.4), 1080);
  assert.equal(clampDimension(9000), 8192);
  assert.equal(clampDimension(0), null);
  assert.equal(clampDimension("x"), null);
});

// A 16-byte JPEG-ish buffer and a 16-byte PNG-ish buffer: enough to satisfy
// the magic-byte check without shipping a real image.
function dataUrl(mime, bytes) {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}
const JPEG_BYTES = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0];

test("parseThumbnailDataUrl: decodes a real data URL", () => {
  const parsed = parseThumbnailDataUrl(dataUrl("image/jpeg", JPEG_BYTES));
  assert.equal(parsed.contentType, "image/jpeg");
  assert.equal(parsed.buffer.length, JPEG_BYTES.length);
});

test("parseThumbnailDataUrl: accepts PNG and WebP", () => {
  const webp = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0];
  assert.equal(parseThumbnailDataUrl(dataUrl("image/png", PNG_BYTES)).contentType, "image/png");
  assert.equal(parseThumbnailDataUrl(dataUrl("image/webp", webp)).contentType, "image/webp");
});

test("parseThumbnailDataUrl: rejects a non-image payload", () => {
  const text = Buffer.from("this is not an image at all").toString("base64");
  assert.equal(parseThumbnailDataUrl(`data:image/jpeg;base64,${text}`), null);
});

test("parseThumbnailDataUrl: rejects malformed or disallowed data URLs", () => {
  assert.equal(parseThumbnailDataUrl("nope"), null);
  assert.equal(parseThumbnailDataUrl("data:image/gif;base64,R0lGOD"), null);
  assert.equal(parseThumbnailDataUrl("data:image/jpeg,notbase64"), null);
  assert.equal(parseThumbnailDataUrl(null), null);
});

test("parseThumbnailDataUrl: rejects anything over the byte cap", () => {
  const big = dataUrl("image/jpeg", JPEG_BYTES);
  assert.equal(parseThumbnailDataUrl(big, { maxBytes: 4 }), null);
});
