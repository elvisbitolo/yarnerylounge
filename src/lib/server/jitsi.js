import jwt from "jsonwebtoken";

// Jitsi as a Service (8x8.vc) helpers: room-name mapping + JWT signing.
// The tenant appId and private RSA key come from env; the key never lives in
// the repo (it is provisioned into JITSI_PRIVATE_KEY from the user's .pk file).

export function getJitsiAppId() {
  return process.env.JITSI_APP_ID || "";
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

// Signs a short-lived (1h) RS256 JaaS JWT. `identity` is the Firestore uid and
// `email` becomes the Jitsi participant id (per spec); displayName fills the tile.
export async function signJitsiToken({ identity, displayName, email = "", avatar = "", roomName }) {
  const appId = getJitsiAppId();
  const privateKey = (process.env.JITSI_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!appId || !(privateKey.startsWith("-----BEGIN"))) {
    throw new Error("Jitsi is not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: "jitsi",
    exp: now + 3600,
    iat: now,
    nbf: now - 30,
    iss: appId,
    sub: appId,
    room: jitsiFullRoom(roomName),
    context: {
      user: {
        id: email || identity,
        name: displayName || "Member",
        email: email || "",
        avatar: avatar || "",
      },
      features: { recording: "jigasi", livestreaming: true, "outgoing-call": true },
    },
  };

  return jwt.sign(payload, privateKey, {
    algorithm: "RS256",
    header: { kid: appId },
  });
}