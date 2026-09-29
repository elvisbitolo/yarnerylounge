import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  buildStoragePath,
  clampSize,
  extractMeetingName,
  findRoomByMeeting,
  isSourceExpired,
  normalizeMeetingKey,
  parseJaasSignature,
  parseRecordingUploaded,
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
