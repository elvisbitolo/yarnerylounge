import { NextResponse } from "next/server";
import { AUTH_COOKIE, SESSION_MAX_AGE_SECONDS, rotateCookieSession } from "@/lib/server/auth";
import { serializeSupabaseCookie } from "@/lib/server/auth-core";
import { assertSameOrigin } from "@/lib/server/same-origin";
import { rateLimitGuard } from "@/lib/server/rate-limit";

// Rotates the Supabase access + refresh tokens stored in the session cookie and
// writes the fresh pair back, so an expired access token (Supabase access
// tokens default to ~1h) never strands a signed-in member. Refresh tokens are
// single-use, so this route is the ONLY consumer of the stored refresh token —
// getCurrentUser never refreshes (server components cannot write cookies).
export async function POST(req) {
  const crossOrigin = assertSameOrigin(req);
  if (crossOrigin) return crossOrigin;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = rateLimitGuard(`refresh-ip:${ip}`, { limit: 60 });
  if (limited) return limited;

  const rotated = await rotateCookieSession();

  if (!rotated) {
    // No cookie at all — nothing to rotate. Valid access tokens needing no
    // rotation have nowhere to go here, which is expected: callers only POST
    // this route when they suspect the session is stale.
    return NextResponse.json({ error: "not_supabase_session" }, { status: 400 });
  }

  if (rotated.error === "expired") {
    const res = NextResponse.json({ error: "session_expired" }, { status: 401 });
    res.cookies.set(AUTH_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return res;
  }

  if (rotated.error === "unavailable") {
    const res = NextResponse.json({ error: "account_unavailable" }, { status: 401 });
    res.cookies.set(AUTH_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return res;
  }

  const res = NextResponse.json({ ok: true, uid: rotated.identity.uid });
  res.cookies.set(
    AUTH_COOKIE,
    serializeSupabaseCookie({
      access: rotated.access,
      refresh: rotated.refresh,
    }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    }
  );
  return res;
}