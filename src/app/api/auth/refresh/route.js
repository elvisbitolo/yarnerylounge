import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE } from "@/lib/server/auth";
import {
  parseSessionCookie,
  serializeSessionCookie,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/server/auth-core";
import {
  resolveSessionStatus,
  getSessionRow,
  SESSION_GONE,
  SESSION_OK,
  SESSION_UNAVAILABLE,
} from "@/lib/server/session-store";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { assertSameOrigin } from "@/lib/server/same-origin";
import { rateLimitGuard } from "@/lib/server/rate-limit";

// Re-issuing the same sid with a fresh maxAge on every successful check is what
// makes the 14-day window genuinely sliding in the browser too — the cookie no
// longer hard-expires 14 days after login while the server session stays alive.
const SESSION_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};

export async function POST(req) {
  const crossOrigin = assertSameOrigin(req);
  if (crossOrigin) return crossOrigin;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = rateLimitGuard(`refresh-ip:${ip}`, { limit: 120 });
  if (limited) return limited;

  let body = {};
  try {
    body = await req.json();
  } catch {
    // no body is fine — the server-side session may be enough
  }

  const sid = parseSessionCookie((await cookies()).get(AUTH_COOKIE)?.value)?.sid;
  const resolved = sid ? await resolveSessionStatus(sid) : { status: SESSION_GONE };

  if (resolved.status === SESSION_UNAVAILABLE) {
    // Could not verify the session right now. Do not touch the cookie — this route
    // is the auth wall's last-chance healer, so clearing here on a transient
    // fault is how a live member ends up locked out and forced to re-enter
    // credentials. Answer "retry" and let the member keep the session.
    return NextResponse.json(
      { error: "session_unavailable" },
      { status: 503, headers: { "Retry-After": "5" } }
    );
  }

  if (resolved.status === SESSION_OK) {
    const res = NextResponse.json({ ok: true, uid: resolved.identity.uid });
    res.cookies.set(AUTH_COOKIE, serializeSessionCookie(sid), SESSION_COOKIE);
    return res;
  }

  // The stored session is definitively gone. As a last resort, if the browser
  // still holds a live Supabase session for the SAME member, repair the Session
  // row with those tokens instead of forcing a re-login.
  if (sid && typeof body.accessToken === "string" && body.accessToken) {
    const repaired = await repairSessionFromBrowser(sid, body.accessToken, String(body.refreshToken || ""));
    if (repaired) {
      const res = NextResponse.json({ ok: true, uid: repaired });
      res.cookies.set(AUTH_COOKIE, serializeSessionCookie(sid), SESSION_COOKIE);
      return res;
    }
  }

  const res = NextResponse.json({ error: "session_expired" }, { status: 401 });
  res.cookies.set(AUTH_COOKIE, "", { ...SESSION_COOKIE, maxAge: 0 });
  return res;
}

async function repairSessionFromBrowser(sid, accessToken, refreshToken) {
  try {
    const row = await getSessionRow(sid);
    if (!row) return null;

    // Never resurrect a session that was deliberately ended. A revoked row is
    // either an explicit sign-out or the dead-refresh-token verdict, and
    // un-revoking it here (this path used to write `revokedAt: null`) would let
    // any browser holding a token for that member bring a retired session back
    // to life. A row past its sliding window is equally finished.
    if (row.revokedAt || row.expiresAt <= new Date()) return null;

    // Verify the browser token really belongs to the sid's owner before
    // trusting it (network check against Supabase Auth, like login does).
    const { default: supabaseAdmin } = await import("@/lib/supabase/service");
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
    if (error || !data?.user || data.user.id !== row.userId) return null;

    const prisma = getPrisma();
    if (!prisma) return null;
    await prisma.session.update({
      where: { id: sid },
      data: {
        accessToken,
        refreshToken: refreshToken || row.refreshToken || "",
        expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
        lastSeenAt: new Date(),
      },
    });
    return row.userId;
  } catch (err) {
    logError("session.refresh_repair_failed", { error: err.message });
    return null;
  }
}