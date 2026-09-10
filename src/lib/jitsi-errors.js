// Centralized JaaS/Jitsi error normalization.
//
// Everything that can go wrong with a room is classified into a small set of
// stable codes. The UI maps codes to friendly i18n strings; raw browser and
// Jitsi error objects (kid/iss/JWT/stack traces) NEVER reach the user.
//
// This module is isomorphic on purpose (importable from the client) and
// imports nothing server-only, so a single normalization layer is shared.

export const JITSI_ERROR = {
  JAAS_AUTH_ERROR: "JAAS_AUTH_ERROR",
  JAAS_TOKEN_ERROR: "JAAS_TOKEN_ERROR",
  JAAS_CONFIG_ERROR: "JAAS_CONFIG_ERROR",
  CONFERENCE_CONNECTION_ERROR: "CONFERENCE_CONNECTION_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  RECONNECTING: "RECONNECTING",
  CONNECTION_LOST: "CONNECTION_LOST",
  CAMERA_PERMISSION_ERROR: "CAMERA_PERMISSION_ERROR",
  CAMERA_UNAVAILABLE: "CAMERA_UNAVAILABLE",
  CAMERA_IN_USE: "CAMERA_IN_USE",
  CAMERA_TIMEOUT: "CAMERA_TIMEOUT",
  CAMERA_UNSUPPORTED: "CAMERA_UNSUPPORTED",
  MIC_PERMISSION_ERROR: "MIC_PERMISSION_ERROR",
  MIC_UNAVAILABLE: "MIC_UNAVAILABLE",
  MIC_IN_USE: "MIC_IN_USE",
  RECORDING_PERMISSION_ERROR: "RECORDING_PERMISSION_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
};

// Friendly fallback strings. The i18n layer overrides these, but they exist so
// a missed locale can never surface raw browser/Jitsi text.
const DEFAULT_TEXT = {
  [JITSI_ERROR.JAAS_AUTH_ERROR]: {
    title: "Unable to join room",
    message: "We couldn't authenticate your connection. Please try again.",
  },
  [JITSI_ERROR.JAAS_TOKEN_ERROR]: {
    title: "Unable to join room",
    message: "We couldn't authenticate your connection. Please try again.",
  },
  [JITSI_ERROR.JAAS_CONFIG_ERROR]: {
    title: "Unable to join room",
    message: "This room isn't available right now. Please try again.",
  },
  [JITSI_ERROR.CONFERENCE_CONNECTION_ERROR]: {
    title: "Unable to join room",
    message: "We couldn't connect to the room. Please try again.",
  },
  [JITSI_ERROR.NETWORK_ERROR]: {
    title: "Connection lost",
    message: "Your connection dropped. Please try again.",
  },
  [JITSI_ERROR.CONNECTION_LOST]: {
    title: "Connection lost",
    message: "We lost the connection to this room. Please try again.",
  },
  [JITSI_ERROR.RECONNECTING]: {
    title: "Reconnecting",
    message: "Reconnecting…",
  },
  [JITSI_ERROR.RECORDING_PERMISSION_ERROR]: {
    title: "Recording isn't available",
    message: "Recording isn't available for this room.",
  },
  [JITSI_ERROR.UNKNOWN_ERROR]: {
    title: "Something went wrong",
    message: "Unable to join this room. Please try again.",
  },
};

const MEDIA_MSGS = {
  camera: {
    [JITSI_ERROR.CAMERA_PERMISSION_ERROR]:
      "Camera access was denied. You can still join without video.",
    [JITSI_ERROR.CAMERA_UNAVAILABLE]:
      "No camera was detected. You can continue with your profile image.",
    [JITSI_ERROR.CAMERA_IN_USE]: "Your camera is being used by another application.",
    [JITSI_ERROR.CAMERA_TIMEOUT]:
      "This is taking longer than expected. You can retry or continue without video.",
    [JITSI_ERROR.CAMERA_UNSUPPORTED]:
      "Your browser doesn't support camera access on this connection.",
  },
  mic: {
    [JITSI_ERROR.MIC_PERMISSION_ERROR]:
      "Microphone access was denied. You can still join without audio.",
    [JITSI_ERROR.MIC_UNAVAILABLE]: "No microphone was detected. You can join without audio.",
    [JITSI_ERROR.MIC_IN_USE]: "Your microphone is being used by another application.",
  },
};

function textFor(code) {
  return (
    DEFAULT_TEXT[code] || {
      title: DEFAULT_TEXT[JITSI_ERROR.UNKNOWN_ERROR].title,
      message: DEFAULT_TEXT[JITSI_ERROR.UNKNOWN_ERROR].message,
    }
  );
}

function mediaText(kind, code) {
  return MEDIA_MSGS[kind]?.[code] || textFor(JITSI_ERROR.UNKNOWN_ERROR).message;
}

function classifyMediaDOMException(errKind, name) {
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return errKind === "camera"
        ? JITSI_ERROR.CAMERA_PERMISSION_ERROR
        : JITSI_ERROR.MIC_PERMISSION_ERROR;
    case "NotFoundError":
    case "DevicesNotFoundError":
      return errKind === "camera" ? JITSI_ERROR.CAMERA_UNAVAILABLE : JITSI_ERROR.MIC_UNAVAILABLE;
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
    case "InUseAttributeError":
      return errKind === "camera" ? JITSI_ERROR.CAMERA_IN_USE : JITSI_ERROR.MIC_IN_USE;
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return errKind === "camera"
        ? JITSI_ERROR.CAMERA_UNAVAILABLE
        : JITSI_ERROR.MIC_UNAVAILABLE;
    case "SecurityError":
    case "TypeError":
      return errKind === "camera"
        ? JITSI_ERROR.CAMERA_UNSUPPORTED
        : JITSI_ERROR.MIC_UNAVAILABLE;
    default:
      return JITSI_ERROR.UNKNOWN_ERROR;
  }
}

// Normalize a user-media permission/track error into a stable code + friendly
// message. `errKind` is "camera" or "mic". Used for both the prejoin preview
// and any local device errors surfaced during the call.
export function normalizeMediaError(err, errKind) {
  const name =
    err?.name ||
    err?.error?.name ||
    (typeof err === "object" && err !== null ? Object.keys(err).find((k) => !["name"].includes(k)) || "" : "");
  const code = classifyMediaDOMException(errKind, name);
  return { code, message: mediaText(errKind, code), retryable: true };
}

function containsAny(text, needles) {
  const t = String(text || "").toLowerCase();
  return needles.some((n) => t.includes(n.toLowerCase()));
}

// Jitsi conference/iframe errors come in many shapes: error objects from
// `conferenceFailed` / `errorOccurred`, or `{ error: "..." }` strings. Detect
// the common categories without exposing internals.
export function normalizeJitsiError(err) {
  const e = err || {};
  const errorObj = e.error || e;
  const message = [e.name, e.message, e.description, errorObj?.name, errorObj?.message]
    .filter(Boolean)
    .join(" ")
    .trim();

  const authed = errorObj.authenticationFailed === true || e.authenticationFailed === true;
  const pwRequired = errorObj.passwordRequired === true || errorObj.passwordNotSupported === true;
  const forbidden =
    errorObj.forbidden === true || errorObj.notAllowed === true || errorObj.role === "ERROR_FORBIDDEN";
  const connBroken =
    errorObj.connectionError === true ||
    errorObj.connectionFailed === true ||
    errorObj.connectionExpired === true ||
    errorObj.transportError === true ||
    errorObj.xmppError === true;

  // Auth-class errors. Match the JaaS failure text ("kid", "iss", "jwt", …)
  // but never surface ANY of those tokens to the user.
  if (
    authed ||
    pwRequired ||
    forbidden ||
    containsAny(message, [
      "authentication failed",
      "not allowed to join",
      "key id",
      "kid does not match",
      "'iss'",
      "jwt",
      "json web token",
      "join error",
      "forbidden",
    ])
  ) {
    return { ...textFor(JITSI_ERROR.JAAS_AUTH_ERROR), code: JITSI_ERROR.JAAS_AUTH_ERROR, retryable: true };
  }

  if (containsAny(message, ["recording", "record"]) &&
      containsAny(message, ["not allowed", "permission", "forbidden", "unavailable", "not enabled"])) {
    return {
      ...textFor(JITSI_ERROR.RECORDING_PERMISSION_ERROR),
      code: JITSI_ERROR.RECORDING_PERMISSION_ERROR,
      retryable: false,
    };
  }

  const isConference =
    errorObj.type === "conferenceFailed" ||
    e.name === "conferenceFailed" ||
    e.type === "conferenceFailed" ||
    errorObj.name === "conferenceFailed";

  if (connBroken || containsAny(message, ["connection interrupted", "connection lost", "network", "transport", "websocket", "reconnecting"])) {
    return { ...textFor(JITSI_ERROR.NETWORK_ERROR), code: JITSI_ERROR.NETWORK_ERROR, retryable: true };
  }

  if (isConference || containsAny(message, ["conference failed", "could not connect", "connection failed", "server error"])) {
    return {
      ...textFor(JITSI_ERROR.CONFERENCE_CONNECTION_ERROR),
      code: JITSI_ERROR.CONFERENCE_CONNECTION_ERROR,
      retryable: true,
    };
  }

  return { ...textFor(JITSI_ERROR.UNKNOWN_ERROR), code: JITSI_ERROR.UNKNOWN_ERROR, retryable: true };
}

// Build a friendly error object for a known classification code (used for
// modal/title messages). Never includes technical internals.
export function jitsiErrorInfo(code) {
  const t = textFor(code);
  return { code, title: t.title, message: t.message, retryable: true };
}

// Verify a JaaS token response from our own API route before handing it to the
// Jitsi iframe. Returns null when the payload is unusable.
export function validateTokenResponse(data) {
  if (!data || typeof data !== "object") return null;
  if (typeof data.token !== "string" || data.token.split(".").length !== 3) return null;
  if (typeof data.appId !== "string" || !data.appId.trim()) return null;
  if (typeof data.roomName !== "string" || !data.roomName.trim()) return null;
  return data;
}

// Development-only media timing log. No-op in production bundles.
export function logDevTiming(label, startedAt) {
  if (process.env.NODE_ENV === "production") return;
  const elapsed = Date.now() - startedAt;
  console.info(`[room] ${label}: ${elapsed}ms`);
}