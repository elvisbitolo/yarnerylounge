import jwt from "jsonwebtoken";

// Jitsi as a Service (8x8.vc) helpers: room-name mapping + JWT signing.
//
// JaaS identity has THREE distinct credentials — never conflate them:
//   JITSI_APP_ID       -> the tenant AppID (e.g. "vpaas-magic-cookie-...")
//                          used as the JWT "sub" claim and the room prefix.
//   JITSI_API_KEY_ID   -> the API Key ID listed in the JaaS console for the
//                          uploaded public key (e.g. "<AppID>/4f4910"), used
//                          as the JWT header "kid" claim. NOT the AppID.
//   JITSI_PRIVATE_KEY  -> the RSA private key that signs the JWT. Never
//                          exposed to clients and never used as "kid".
//
// JWT contract (https://developer.8x8.com/jaas/docs/api-keys-jwt):
//   header:  { alg: "RS256", kid: <API Key ID>, typ: "JWT" }
//   body:    aud: "jitsi", iss: "chat", sub: <AppID>, room: <"AppID/Room">,
//            exp/nbf, context.user { id, name, avatar, email, moderator },
//            context.features { recording, livestreaming, transcription, outbound-call }

export function getJitsiAppId() {
  return process.env.JITSI_APP_ID || "";
}

// The API Key ID registered for this tenant in the JaaS console. This is the
// value the JaaS server looks up via the JWT header "kid" before validating
// the signature, so it must match the console exactly.
export function getJitsiApiKeyId() {
  return process.env.JITSI_API_KEY_ID || "";
}

export function isJitsiConfigured() {
  const appId = getJitsiAppId();
  const apiKeyId = getJitsiApiKeyId();
  const privateKey = (process.env.JITSI_PRIVATE_KEY || "")
    .replace(/\\n/g, "\n")
    .trim();
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

// Full JaaS room id used in the iframe URL and the JWT "room" claim:
// "<appId>/Yarnery-Lounge-<RoomName>".
export function jitsiFullRoom(roomName) {
  return `${getJitsiAppId()}/${jitsiRoomName(roomName)}`;
}

// Signs a short-lived (1h) RS256 JaaS JWT.
//   identity    -> unique user id (Auth uid) -> context.user.id
//   displayName -> participant tile name -> context.user.name
//   email       -> participant email -> context.user.email
//   avatar      -> optional public avatar URL -> context.user.avatar
//   moderator   -> grants JaaS moderator powers (and JaaS recording UI)
//   recording   -> grants the JaaS "recording" feature in features.*
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
  const privateKey = (process.env.JITSI_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!appId) {
    throw new Error("JAAS_CONFIG_MISSING_APP_ID");
  }
  if (!apiKeyId || apiKeyId === appId) {
    throw new Error("JAAS_CONFIG_MISSING_API_KEY_ID");
  }
  if (!privateKey.startsWith("-----BEGIN")) {
    throw new Error("JAAS_CONFIG_MISSING_PRIVATE_KEY");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: "jitsi",
    iss: "chat",
    sub: appId,
    room: jitsiFullRoom(roomName),
    exp: now + 3600,
    iat: now,
    nbf: now - 30,
    context: {
      user: {
        id: identity || "anonymous",
        name: displayName || "Member",
        email: email || "",
        avatar: avatar || "",
        moderator: Boolean(moderator),
      },
      features: {
        recording: Boolean(recording),
        livestreaming: false,
        transcription: false,
        "outbound-call": false,
      },
      room: { regex: false },
    },
  };

  return jwt.sign(payload, privateKey, {
    algorithm: "RS256",
    header: { alg: "RS256", kid: apiKeyId, typ: "JWT" },
  });
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