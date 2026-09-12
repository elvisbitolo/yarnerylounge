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

// Serializes a Supabase session reference into the value stored in the
// httpOnly session cookie. The refresh token (when present) is kept for the
// future /api/auth/refresh endpoint; access tokens expire on their own.
export function serializeSupabaseCookie(session) {
  return JSON.stringify({
    v: 1,
    a: session.access || "",
    r: session.refresh || null,
  });
}

// Parses the cookie back into { access, refresh } — or null when the cookie is
// not a Supabase session value.
export function parseSessionCookie(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed.a === "string" && parsed.a) {
      return { access: parsed.a, refresh: parsed.r || null };
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