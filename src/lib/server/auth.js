import { cookies } from "next/headers";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { mapUserRow } from "@/lib/server/user-core";
import {
  isSupabaseAccessJwt,
  parseSessionCookie,
  supabaseProjectRef,
  mapSupabaseUser,
} from "@/lib/server/auth-core";

export const AUTH_COOKIE = "community-auth";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

// Verifies a Supabase Auth access token with the project's admin client and
// maps it to the identity shape getCurrentUser() returns ({ uid, email, ... }).
// Returns null when the token is missing, invalid, or credentials are absent.
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

// Rotates the Supabase access + refresh tokens stored in the httpOnly cookie.
// Unlike getCurrentUser (server components cannot write cookies) the callers of
// this helper ARE route handlers and must write the fresh { access, refresh }
// pair back themselves. Returns the mapped identity plus the fresh pair, a
// reason the rotation failed, or null when there is no refreshable cookie.
export async function rotateCookieSession() {
  const cookieStore = await cookies();
  const session = parseSessionCookie(cookieStore.get(AUTH_COOKIE)?.value);
  if (!session?.access || !session?.refresh) return null;

  try {
    const { default: supabaseAdmin } = await import("@/lib/supabase/service");
    const { data, error } = await supabaseAdmin.auth.refreshSession({
      refresh_token: session.refresh,
    });
    if (error || !data?.session?.access_token) return { error: "expired" };

    const identity = mapSupabaseUser(data.session.user);
    const prisma = getPrisma();
    if (prisma) {
      try {
        const row = await prisma.user.findUnique({
          where: { id: identity.uid },
          select: { id: true, suspended: true },
        });
        if (!row || row.suspended) return { error: "unavailable" };
      } catch (err) {
        // Fail open on DB errors: a brief outage must not log members out.
        logError("auth.rotate_db_check_failed", { error: err.message });
      }
    }

    return {
      identity,
      access: data.session.access_token,
      refresh: data.session.refresh_token,
    };
  } catch (err) {
    logError("auth.rotate_failed", { error: err.message });
    return { error: "expired" };
  }
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(AUTH_COOKIE)?.value;
  if (!sessionCookie) return null;

  // Supabase session cookie (JSON {v, a, r}) — verify the access JWT against
  // the Supabase project. Fails closed: a Supabase-shaped token that does not
  // verify is never passed down.
  const supabaseSession = parseSessionCookie(sessionCookie);
  const projectRef = supabaseProjectRef();
  if (supabaseSession?.access) {
    if (!isSupabaseAccessJwt(supabaseSession.access, projectRef)) return null;
    const identity = await verifySupabaseToken(supabaseSession.access);
    if (!identity) return null;
    const userDoc = await getUserDoc(identity.uid);
    if (userDoc?.suspended) return null;
    return identity;
  }

  // Unknown cookie shape — not a Supabase session.
  return null;
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
