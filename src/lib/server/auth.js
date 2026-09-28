import { cookies } from "next/headers";
import { cache } from "react";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { mapUserRow } from "@/lib/server/user-core";
import {
  mapSupabaseUser,
  parseSessionCookie,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/server/auth-core";
import {
  resolveSessionStatus,
  SESSION_GONE,
  SESSION_OK,
} from "@/lib/server/session-store";
import { resolveActingIdentity } from "@/lib/server/acting-as";

export { SESSION_MAX_AGE_SECONDS };

export const AUTH_COOKIE = "community-auth";

// Verifies a Supabase Auth access token with the project's admin client and
// maps it to the identity shape getCurrentUser() returns ({ uid, email, ... }).
// Returns null when the token is missing, invalid, or credentials are absent.
// Used only at login/signup exchange time (fresh tokens from the browser).
export async function verifySupabaseToken(token) {
  if (!token) return null;
  try {
    const { default: supabaseAdmin } = await import("@/lib/supabase/service");
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return null;
    return mapSupabaseUser(data.user);
  } catch (err) {
    logError("auth.supabase_verify_failed", { error: err.message });
    return null;
  }
}

// Status-aware form of getCurrentUser(). The distinction matters: "the member is
// signed out" (SESSION_GONE) is the only answer that authorises deleting the
// httpOnly session cookie, while a transient store/Supabase fault
// (SESSION_UNAVAILABLE) must leave the cookie completely alone. Callers that
// clear cookies on sign-out use this; everything else uses getCurrentUser().
export async function getCurrentUserStatus() {
  const cookieStore = await cookies();
  const sid = parseSessionCookie(cookieStore.get(AUTH_COOKIE)?.value)?.sid;
  if (!sid) return { status: SESSION_GONE };

  const resolved = await resolveSessionStatus(sid);
  if (resolved.status !== SESSION_OK || !resolved.identity) return { status: resolved.status };

  // The session always belongs to the member who actually authenticated. While
  // they hold an active AccountGrant, the identity the rest of the server sees
  // is the principal's instead — same uid, name, role, email — so the member
  // does everything as the principal without a single endpoint knowing about it.
  // The real member stays on the returned object as actorUid, which is what the
  // write path stores in createdById.
  const identity = await resolveActingIdentity(resolved.identity);

  // A suspended member is signed out on purpose, so the cookie goes with it.
  // Checked against the real member, not the principal: suspension has to be
  // enforceable on the person who is actually signed in.
  const userDoc = await getUserDoc(resolved.identity.uid);
  if (userDoc?.suspended) return { status: SESSION_GONE, suspended: true };
  return { status: SESSION_OK, identity };
}

// Resolves the current member from the opaque session cookie via the
// server-side Session store (Supabase tokens live in Postgres, not the
// browser). Rotation happens transparently inside the DB, so server components
// — which cannot write cookies — still survive the ~1h access-token expiry
// with zero /login flashes. Returns null when there is no usable member: either
// genuinely gone (no cookie, revoked, past the sliding 14-day window, suspended)
// or the store could not be reached — callers that must tell those apart, and
// that clear the cookie, use getCurrentUserStatus().
export async function getCurrentUser() {
  const result = await getCurrentUserStatus();
  return result.status === SESSION_OK ? result.identity : null;
}

// Read the users table (Postgres). Returns the doc shape
// ({ id, ...fields }) so every consumer is untouched. Wrapped in React's
// cache() so the doc is fetched at most once per request — pages that call
// getCurrentUser() (which reads the user doc internally) and then read the
// doc again share the same DB hit.
export const getUserDoc = cache(async function getUserDoc(uid) {
  try {
    const prisma = getPrisma();
    if (!prisma) return null;
    const row = await prisma.user.findUnique({ where: { id: uid } });
    return row ? mapUserRow(row) : null;
  } catch (err) {
    logError("auth.prisma_user_read_failed", { error: err.message });
    return null;
  }
});

// Prisma-first user lookup by email (used by the signup wall + session
// exchange). Returns the doc shape or null.
export async function getUserByEmail(email) {
  if (!email) return null;
  const clean = email.toLowerCase().trim();
  try {
    const prisma = getPrisma();
    if (!prisma) return null;
    const row = await prisma.user.findFirst({
      where: { email: { equals: clean, mode: "insensitive" } },
    });
    return row ? mapUserRow(row) : null;
  } catch (err) {
    logError("auth.prisma_user_by_email_failed", { error: err.message });
    return null;
  }
}

export function canModerate(userDoc) {
  return ["owner", "moderator"].includes(userDoc?.role);
}

export function isOwner(userDoc) {
  return userDoc?.role === "owner";
}
