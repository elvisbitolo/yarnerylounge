// Pure helpers for the Supabase Auth cutover — no I/O so they can be unit
// tested with node:test. See ./auth.js for the session-choke-point wiring and
// /api/auth/session for token exchange.

// Decodes (without verifying) the payload of a JWT. Returns null for anything
// that is not a well-formed three-part token or does not hold JSON.
export function parseJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

// Extracts the project ref (subdomain) from a Supabase project URL like
// https://abcdefgh.supabase.co
export function supabaseProjectRef(url) {
  const source = url || process.env.SUPABASE_URL || "";
  const match = source.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return match ? match[1] : "";
}

// True when the token is a Supabase Auth access token for the authenticated
// role, optionally checked against the expected project ref. Supabase access
// tokens carry iss="https://<ref>.supabase.co/auth/v1", role="authenticated"
// and ref="<ref>". This is a cheap pre-filter; the token is cryptographically
// verified later via the service-role `getUser`.
export function isSupabaseAccessJwt(token, ref) {
  if (!token) return false;
  const payload = parseJwtPayload(token);
  if (!payload) return false;
  if (payload.role !== "authenticated") return false;
  const tokenRef = (payload.iss && payload.iss.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co\/auth\/v1/i))?.[1] || payload.ref;
  if (!tokenRef) return false;
  if (ref && tokenRef !== ref) return false;
  return true;
}

// Rolling session length. Every server-side refresh extends the session, so a
// signed-in member is never logged out by inactivity; only explicit sign-out
// (or an account that has been revoked/deleted) ends it.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

// Serializes the opaque session id into the value stored in the httpOnly
// session cookie. The Supabase tokens themselves live server-side in the
// Session table (v2), never in the browser cookie.
export function serializeSessionCookie(sid) {
  return JSON.stringify({ v: 2, s: sid });
}

// Parses the cookie back into { sid } — or null when the cookie is missing,
// malformed, or a legacy v1 Supabase-token cookie (which must be recreated via
// the login flow).
export function parseSessionCookie(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && parsed.v === 2 && typeof parsed.s === "string" && parsed.s) {
      return { sid: parsed.s };
    }
    return null;
  } catch {
    return null;
  }
}

// Maps the Supabase Auth user object to the identity shape consumers expect
// from getCurrentUser().
export function mapSupabaseUser(user) {
  if (!user) return null;
  return {
    uid: user.id || "",
    email: user.email || "",
    email_verified: !!(user.email_confirmed_at || user.phone_confirmed_at),
    name:
      user.user_metadata?.name ||
      user.user_metadata?.displayName ||
      (user.email || "").split("@")[0] ||
      "Member",
    photoURL: user.user_metadata?.avatar_url || user.user_metadata?.picture || "",
    role: "member",
  };
}

// Maps identity straight from a Supabase access-token payload (sub/email/
// email_verified/user_metadata are embedded in the JWT claims), so the shared
// session fast path needs no network round-trip to Supabase Auth.
export function identityFromAccessToken(access) {
  const payload = parseJwtPayload(access);
  if (!payload?.sub) return null;
  const meta = payload.user_metadata || {};
  return mapSupabaseUser({
    id: payload.sub,
    email: payload.email || "",
    email_confirmed_at: payload.email_verified ? new Date().toISOString() : null,
    user_metadata: meta,
  });
}
