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

// Resolves an opaque session id to { session, identity } or null. Fast path:
// local JWT exp check against the stored access token (zero network). Slow
// path: serialized server-side refresh under a per-session advisory lock, with
// reuse detection so concurrent requests can never burn the same single-use
// refresh token.
export async function resolveSession(sid) {
  if (!sid) return null;
  const prisma = getPrisma();
  if (!prisma) return null;

  let row;
  try {
    row = await prisma.session.findUnique({ where: { id: sid } });
  } catch (err) {
    logError("session.resolve_read_failed", { error: err.message });
    return null;
  }
  if (!row || row.revokedAt || row.expiresAt <= new Date()) {
    if (row && !row.revokedAt) {
      // Past the 14-day window — retire the row so it cannot be resurrected.
      prisma.session
        .update({ where: { id: sid }, data: { revokedAt: new Date() } })
        .catch(() => {});
    }
    return null;
  }

  if (isAccessTokenUsable(row.accessToken)) {
    const identity = identityFromAccessToken(row.accessToken);
    if (!identity) return null;
    maybeTouch(prisma, sid);
    return { identity, session: row };
  }

  return refreshSessionRow(prisma, sid);
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
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${sid}))`;
      const row = await tx.session.findUnique({ where: { id: sid } });
      if (!row || row.revokedAt || row.expiresAt <= new Date()) return null;

      // A peer rotated the token while we waited on the lock — reuse its result.
      if (isAccessTokenUsable(row.accessToken)) {
        const identity = identityFromAccessToken(row.accessToken);
        return identity ? { identity, session: row } : null;
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
        }
        return null;
      }

      const access = data.session.access_token;
      const identity = identityFromAccessToken(access);
      if (!identity) return null;

      const session = await tx.session.update({
        where: { id: sid },
        data: {
          accessToken: access,
          refreshToken: data.session.refresh_token,
          expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
          lastSeenAt: new Date(),
        },
      });
      return { identity, session };
    });
  } catch (err) {
    logError("session.rotate_failed", { error: err.message });
    return null;
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
