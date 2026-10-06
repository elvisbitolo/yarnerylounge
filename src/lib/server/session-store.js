import { randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import {
  identityFromAccessToken,
  isSupabaseAccessJwt,
  parseJwtPayload,
  SESSION_MAX_AGE_SECONDS,
  supabaseProjectRef,
} from "@/lib/server/auth-core";

// Server-side session store (opaque sid cookie -> Session rows in Postgres).
// The Supabase access/refresh tokens live here, NOT in the browser cookie, so
// server components can refresh transparently when an access token expires —
// a signed-in member is never bounced to /login by a ~1h expiry, and the
// single-use refresh-token race across concurrent requests/tabs is resolved by
// a per-session advisory lock.
const LAST_SEEN_TOUCH_MS = 5 * 60 * 1000;

function isAccessTokenUsable(access) {
  if (!isSupabaseAccessJwt(access, supabaseProjectRef())) return false;
  const payload = parseJwtPayload(access);
  return !!payload?.exp && payload.exp * 1000 > Date.now();
}

export async function getSessionRow(sid) {
  const prisma = getPrisma();
  if (!prisma || !sid) return null;
  try {
    return await prisma.session.findUnique({ where: { id: sid } });
  } catch {
    return null;
  }
}

export async function createSession({ uid, accessToken, refreshToken }) {
  const prisma = getPrisma();
  if (!prisma) return null;
  const id = randomUUID();
  try {
    await prisma.session.create({
      data: {
        id,
        userId: uid,
        accessToken,
        refreshToken: refreshToken || "",
        familyId: randomUUID(),
        expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
      },
    });
    return id;
  } catch (err) {
    logError("session.create_failed", { error: err.message });
    return null;
  }
}

export const SESSION_OK = "ok";
// A definitive verdict that the member is signed out: no cookie, no row, the row
// was revoked, it is past the sliding window, or its refresh token is provably
// dead. This is the ONLY verdict that may clear the httpOnly session cookie.
export const SESSION_GONE = "gone";
// "Could not tell right now" — a dead connection pool, a Supabase 5xx, a
// transaction that rolled back. Deliberately NOT the same as SESSION_GONE:
// /api/me is polled several times per page view, so a single blip that read as
// "signed out" would permanently destroy a perfectly healthy session.
export const SESSION_UNAVAILABLE = "unavailable";
// Signed in, session healthy, but the Terms of Service have never been
// accepted. NOT a sign-out: the cookie stays, and this is the one verdict
// that must never reach the cookie-clearing branches — the member is simply
// held at /consent until they tick the box.
export const SESSION_NEEDS_CONSENT = "needs_consent";

// Resolves an opaque session id to { status, identity?, session? }. Fast path:
// local JWT exp check against the stored access token (zero network). Slow
// path: serialized server-side refresh under a per-session advisory lock, with
// reuse detection so concurrent requests can never burn the same single-use
// refresh token.
export async function resolveSessionStatus(sid) {
  if (!sid) return { status: SESSION_GONE };
  const prisma = getPrisma();
  if (!prisma) return { status: SESSION_UNAVAILABLE };

  let row;
  try {
    row = await prisma.session.findUnique({ where: { id: sid } });
  } catch (err) {
    logError("session.resolve_read_failed", { error: err.message });
    return { status: SESSION_UNAVAILABLE };
  }
  if (!row) return { status: SESSION_GONE };
  if (row.revokedAt || row.expiresAt <= new Date()) {
    if (!row.revokedAt) {
      // Past the 14-day window — retire the row so it cannot be resurrected.
      prisma.session
        .update({ where: { id: sid }, data: { revokedAt: new Date() } })
        .catch(() => {});
    }
    return { status: SESSION_GONE };
  }

  if (isAccessTokenUsable(row.accessToken)) {
    const identity = identityFromAccessToken(row.accessToken);
    // A live-looking token we cannot read an identity out of is a corrupt row,
    // not a transient fault — nothing about waiting will fix it.
    if (!identity) return { status: SESSION_GONE };
    maybeTouch(prisma, sid);
    return { status: SESSION_OK, identity, session: row };
  }

  return refreshSessionRow(prisma, sid);
}

// Null-returning wrapper for the call sites that only need "is there a usable
// member?" and treat every failure mode alike. Nothing on this path is allowed
// to clear the session cookie — use resolveSessionStatus for that.
export async function resolveSession(sid) {
  const result = await resolveSessionStatus(sid);
  if (result.status !== SESSION_OK) return null;
  return { identity: result.identity, session: result.session };
}

function maybeTouch(prisma, sid) {
  prisma.session
    .updateMany({
      where: { id: sid, lastSeenAt: { lt: new Date(Date.now() - LAST_SEEN_TOUCH_MS) } },
      data: { lastSeenAt: new Date() },
    })
    .catch(() => {});
}

async function refreshSessionRow(prisma, sid) {
  try {
    return await prisma.$transaction(async (tx) => {
      // Serialize rotation per session so two concurrent requests (multiple
      // tabs, parallel API calls) can never race the single-use refresh token.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sid}))`;
      const row = await tx.session.findUnique({ where: { id: sid } });
      if (!row || row.revokedAt || row.expiresAt <= new Date()) {
        return { status: SESSION_GONE };
      }

      // A peer rotated the token while we waited on the lock — reuse its result.
      if (isAccessTokenUsable(row.accessToken)) {
        const identity = identityFromAccessToken(row.accessToken);
        return identity
          ? { status: SESSION_OK, identity, session: row }
          : { status: SESSION_GONE };
      }

      const { default: supabaseAdmin } = await import("@/lib/supabase/service");
      const { data, error } = await supabaseAdmin.auth.refreshSession({
        refresh_token: row.refreshToken,
      });
      if (error || !data?.session?.access_token) {
        // Only retire the session on a definitively dead refresh token (4xx /
        // no status). A transient Supabase blip (5xx/timeout) must not burn a
        // signed-in member's session — leave the row alone and let the next
        // request retry the rotation.
        const fatal = error && (!error.status || error.status < 500);
        if (fatal) {
          await tx.session
            .update({ where: { id: sid }, data: { revokedAt: new Date() } })
            .catch(() => {});
          return { status: SESSION_GONE };
        }
        return { status: SESSION_UNAVAILABLE };
      }

      const access = data.session.access_token;
      const identity = identityFromAccessToken(access);
      if (!identity) return { status: SESSION_GONE };

      const session = await tx.session.update({
        where: { id: sid },
        data: {
          accessToken: access,
          refreshToken: data.session.refresh_token,
          expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
          lastSeenAt: new Date(),
        },
      });
      return { status: SESSION_OK, identity, session };
    });
  } catch (err) {
    logError("session.rotate_failed", { error: err.message });
    return { status: SESSION_UNAVAILABLE };
  }
}

export async function deleteSession(sid) {
  const prisma = getPrisma();
  if (!prisma || !sid) return;
  try {
    await prisma.session.deleteMany({ where: { id: sid } });
  } catch (err) {
    logError("session.delete_failed", { error: err.message });
  }
}

// Retires expired and long-revoked rows. Called by the daily cron.
export async function cleanupExpiredSessions() {
  const prisma = getPrisma();
  if (!prisma) return 0;
  try {
    const cutRevoked = new Date(Date.now() - SESSION_MAX_AGE_SECONDS * 1000);
    const { count } = await prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { lt: cutRevoked } },
        ],
      },
    });
    return count;
  } catch (err) {
    logError("session.cleanup_failed", { error: err.message });
    return 0;
  }
}
