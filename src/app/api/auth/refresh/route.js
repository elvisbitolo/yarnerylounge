import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/server/auth";
import { parseSessionCookie, serializeSupabaseCookie, mapSupabaseUser } from "@/lib/server/auth-core";
import { assertSameOrigin } from "@/lib/server/same-origin";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

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

  const cookieStore = await cookies();
  const session = parseSessionCookie(cookieStore.get(AUTH_COOKIE)?.value);
  if (!session?.access || !session?.refresh) {
    return NextResponse.json({ error: "not_supabase_session" }, { status: 400 });
  }

  try {
    const { default: supabaseAdmin } = await import("@/lib/supabase/service");
    const { data, error } = await supabaseAdmin.auth.refreshSession({
      refresh_token: session.refresh,
    });
    if (error || !data?.session?.access_token) {
      // Invalid or expired refresh token — the session cannot be renewed.
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

    // A successful rotation must still not resurrect an account that a server
    // page would refuse. Suspended or deleted members get a 401 that clears the
    // cookie instead of fresh tokens — otherwise every /login -> /signing-in ->
    // /dashboard bounce stays "valid-looking" to refresh but dead to
    // getCurrentUser, which is exactly the reload loop people see on mobile.
    const prisma = getPrisma();
    if (prisma) {
      try {
        const identity = mapSupabaseUser(data.session.user);
        const row = await prisma.user.findUnique({
          where: { id: identity.uid },
          select: { id: true, suspended: true },
        });
        if (!row || row.suspended) {
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
      } catch (err) {
        // Fail open on DB errors: a brief outage must not log members out.
        logError("auth.refresh_db_check_failed", { error: err.message });
      }
    }

    const res = NextResponse.json({ ok: true, uid: data.session.user.id });
    res.cookies.set(
      AUTH_COOKIE,
      serializeSupabaseCookie({
        access: data.session.access_token,
        refresh: data.session.refresh_token,
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
  } catch (err) {
    logError("auth.refresh_failed", { error: err.message });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}