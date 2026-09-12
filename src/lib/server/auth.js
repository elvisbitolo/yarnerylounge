import { cookies } from "next/headers";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { mapUserRow } from "@/lib/server/user-core";
import {
  mapSupabaseUser,
  parseSessionCookie,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/server/auth-core";
import { resolveSession } from "@/lib/server/session-store";

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

// Resolves the current member from the opaque session cookie via the
// server-side Session store (Supabase tokens live in Postgres, not the
// browser). Rotation happens transparently inside the DB, so server components
// — which cannot write cookies — still survive the ~1h access-token expiry
// with zero /login flashes. Returns null only when the session is genuinely
// gone (no cookie, revoked, past the sliding 14-day window) or the member has
// been suspended.
export async function getCurrentUser() {
  const cookieStore = await cookies();
  const sid = parseSessionCookie(cookieStore.get(AUTH_COOKIE)?.value)?.sid;
  if (!sid) return null;

  const resolved = await resolveSession(sid);
  if (!resolved?.identity) return null;

  const userDoc = await getUserDoc(resolved.identity.uid);
  if (userDoc?.suspended) return null;
  return resolved.identity;
}

// Read the users table (Postgres). Returns the doc shape
// ({ id, ...fields }) so every consumer is untouched.
export async function getUserDoc(uid) {
  try {
    const prisma = getPrisma();
    if (!prisma) return null;
    const row = await prisma.user.findUnique({ where: { id: uid } });
    return row ? mapUserRow(row) : null;
  } catch (err) {
    logError("auth.prisma_user_read_failed", { error: err.message });
    return null;
  }
}

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
