import jwt from "jsonwebtoken";

// Jitsi as a Service (8x8.vc) helpers: room-name mapping + JWT signing.
//
// JaaS identity has THREE distinct credentials — never conflate them:
//   JITSI_APP_ID       -> the tenant AppID (e.g. "vpaas-magic-cookie-...")
//                          used as the JWT "sub" claim and the room prefix.
//   JITSI_KEY_ID or
//   JITSI_API_KEY_ID   -> the API Key ID listed in the JaaS console for the
//                          uploaded public key (e.g. "<AppID>/4f4910"), used
//                          as the JWT header "kid" claim. NOT the AppID.
//                          JITSI_KEY_ID is preferred when both are present.
//   JITSI_PRIVATE_KEY  -> the RSA private key that signs the JWT. Never
//                          exposed to clients and never used as "kid".
//
// JWT contract (https://developer.8x8.com/jaas/docs/api-keys-jwt):
//   header:  { alg: "RS256", kid: <API Key ID>, typ: "JWT" }
//   body:    aud: "jitsi", iss: "chat", sub: <AppID>,
//            room: the meeting name ONLY (not "AppID/Room" — JaaSMeeting already
//            prefixes the tenant in the iframe). "*" allows every room.
//            exp/nbf, context.user { id, name, avatar, email, moderator },
//            context.features { recording, livestreaming, transcription, outbound-call }
//   moderator + feature flags MUST be the strings "true" / "false". Booleans
//   are accepted by some JWT libraries and then rejected by JaaS, which
//   leaves the iframe stuck on "Connecting".

// A Vercel CLI status line — "◇ injected env (82) from .env.local." — has been
// pasted on top of some env values in this project. This helper recovers the
// LAST non-empty line of a value, discarding any CLI/metadata lines above it.
function lastMeaningfulLine(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const lines = value
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^["']+|["']+$/g, ""))
    .filter(Boolean);
  return lines[lines.length - 1] || "";
}

export function getJitsiAppId() {
  return lastMeaningfulLine(process.env.JITSI_APP_ID);
}

// The API Key ID registered for this tenant in the JaaS console. This is the
// value the JaaS server looks up via the JWT header "kid" before validating
// the signature, so it must match the console exactly. JITSI_KEY_ID is the
// canonical name (matching the 8x8/8x8.vc docs); JITSI_API_KEY_ID is accepted
// as a fallback so Vercel/Env vars added under either name keep working.
export function getJitsiApiKeyId() {
  const keyId = process.env.JITSI_KEY_ID || process.env.JITSI_API_KEY_ID || "";
  return lastMeaningfulLine(keyId);
}

function cleanPrivateKey(raw) {
  const normalized = (raw || "")
    .replace(/\r/g, "")
    .replace(/\\r/g, "")
    .replace(/\\n/g, "\n");
  const lines = normalized
    .split("\n")
    .map((l) => l.trim().replace(/^["']+|["']+$/g, ""))
    .filter(Boolean);
  // Drop any CLI/metadata line above the PEM and anything after its END line.
  const begin = lines.findIndex((l) => l.startsWith("-----BEGIN"));
  const block = begin >= 0 ? lines.slice(begin) : lines;
  const endIdx = block.findIndex((l) => l.startsWith("-----END"));
  const finished = endIdx >= 0 ? block.slice(0, endIdx + 1) : block;
  return finished.join("\n").trim();
}

// The RSA private key with line-break escapes (\r, \r\n, literal \\n) and
// surrounding whitespace normalized, so paste-from-.env keeps working
// regardless of how the value was stored.
export function getJitsiPrivateKey() {
  return cleanPrivateKey(process.env.JITSI_PRIVATE_KEY);
}

export function isJitsiConfigured() {
  const appId = getJitsiAppId();
  const apiKeyId = getJitsiApiKeyId();
  const privateKey = getJitsiPrivateKey();
  return Boolean(
    appId &&
      apiKeyId &&
      apiKeyId !== appId &&
      privateKey.startsWith("-----BEGIN")
  );
}

// Deterministic meeting handle: "Happy Hour Hub" -> "Yarnery-Lounge-Happy-Hour-Hub".
export function jitsiRoomName(roomName) {
  const clean = String(roomName || "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("-");
  return `Yarnery-Lounge-${clean || "Lounge"}`;
}

// Iframe path only (`8x8.vc/<appId>/<room>`). Never put this in the JWT `room`
// claim — JaaS compares that claim to the unprefixed meeting name.
export function jitsiFullRoom(roomName) {
  return `${getJitsiAppId()}/${jitsiRoomName(roomName)}`;
}

function jaasFlag(value) {
  return value ? "true" : "false";
}

// Builds the shared JaaS JWT payload. Extracted so the API route can sign
// inline (guaranteeing the header) while `signJitsiToken` reuses the same
// claims without drifting.
//   appId       -> tenant AppID -> JWT "sub"
//   identity    -> unique user id (Auth uid) -> context.user.id
//   displayName -> participant tile name -> context.user.name
//   email       -> participant email -> context.user.email
//   avatar      -> optional public avatar URL -> context.user.avatar
//   moderator   -> grants JaaS moderator powers (and JaaS recording UI)
//   recording   -> grants the JaaS "recording" feature in features.*
export function buildJitsiTokenPayload({
  appId,
  identity,
  displayName,
  email = "",
  avatar = "",
  roomName,
  moderator = false,
  recording = false,
}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    aud: "jitsi",
    iss: "chat",
    sub: appId,
    room: jitsiRoomName(roomName),
    exp: now + 3600,
    iat: now,
    nbf: now - 30,
    context: {
      user: {
        id: identity || "anonymous",
        name: displayName || "Member",
        email: email || "",
        avatar: avatar || "",
        moderator: jaasFlag(moderator),
      },
      features: {
        recording: jaasFlag(recording),
        livestreaming: "false",
        transcription: "false",
        "outbound-call": "false",
      },
      room: { regex: false },
    },
  };
}

// Signs a short-lived (1h) RS256 JaaS JWT. The header is always
// { alg: "RS256", kid: <API Key ID>, typ: "JWT" } — JaaS rejects any token
// whose "kid" does not match the API Key ID registered in the console.
export async function signJitsiToken({
  identity,
  displayName,
  email = "",
  avatar = "",
  roomName,
  moderator = false,
  recording = false,
}) {
  const appId = getJitsiAppId();
  const apiKeyId = getJitsiApiKeyId();
  const privateKey = getJitsiPrivateKey();

  if (!appId) {
    throw new Error("JAAS_CONFIG_MISSING_APP_ID");
  }
  if (!apiKeyId || apiKeyId === appId) {
    throw new Error("JAAS_CONFIG_MISSING_API_KEY_ID");
  }
  if (!privateKey.startsWith("-----BEGIN")) {
    throw new Error("JAAS_CONFIG_MISSING_PRIVATE_KEY");
  }

  return jwt.sign(
    buildJitsiTokenPayload({
      appId,
      identity,
      displayName,
      email,
      avatar,
      roomName,
      moderator,
      recording,
    }),
    privateKey,
    {
      algorithm: "RS256",
      header: { alg: "RS256", kid: apiKeyId, typ: "JWT" },
    }
  );
}

// Development-only diagnostic: decodes (does NOT verify) a JWT and returns
// safe metadata only. Never includes the signature, private key, or secrets.
export function describeJitsiToken(token) {
  try {
    const decoded = jwt.decode(String(token || ""), { complete: true });
    if (!decoded || !decoded.header || !decoded.payload) return null;
    const p = decoded.payload;
    const now = Math.floor(Date.now() / 1000);
    const features = p.context?.features || {};
    return {
      alg: decoded.header.alg || "",
      kid: decoded.header.kid || "",
      typ: decoded.header.typ || "",
      aud: p.aud || "",
      iss: p.iss || "",
      sub: p.sub || "",
      room: p.room || "",
      nbf: p.nbf,
      exp: p.exp,
      expValid: Number.isFinite(p.exp) && p.exp > now,
      nbfValid: Number.isFinite(p.nbf) && p.nbf <= now,
      moderator: p.context?.user?.moderator ?? null,
      features: {
        recording: features.recording ?? null,
        livestreaming: features.livestreaming ?? null,
        transcription: features.transcription ?? null,
        "outbound-call": features["outbound-call"] ?? null,
      },
      userId: p.context?.user?.id || "",
    };
  } catch {
    return null;
  }
}