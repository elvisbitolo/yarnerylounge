import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  AUTH_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  rotateCookieSession,
} from "@/lib/server/auth";
import {
  isSupabaseAccessJwt,
  parseJwtPayload,
  parseSessionCookie,
  serializeSupabaseCookie,
  supabaseProjectRef,
} from "@/lib/server/auth-core";
import { rateLimitGuard } from "@/lib/server/rate-limit";

// Silent "already signed in" reentry used by the root page. A returning member
// hits "/" -> this route -> straight to /dashboard with zero form flashes:
//   - no session cookie              -> /signup
//   - access token still unexpired   -> /dashboard (no Supabase call)
//   - access token expired, refreshable -> rotate, write fresh cookie, /dashboard
//   - refresh token dead/suspended   -> clear cookie, /signup
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};

const CLEAR_COOKIE_OPTS = { ...COOKIE_OPTS, maxAge: 0 };

export async function GET(req) {
  const url = new URL(req.url);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = rateLimitGuard(`reentry-ip:${ip}`, { limit: 120, windowMs: 60_000 });
  if (limited) return NextResponse.redirect(new URL("/login", url));

  const cookieStore = await cookies();
  const session = parseSessionCookie(cookieStore.get(AUTH_COOKIE)?.value);
  if (!session?.access) {
    return NextResponse.redirect(new URL("/signup", url));
  }

  // Cheap local check first: an unexpired access token needs no network call.
  const payload = parseJwtPayload(session.access);
  if (
    isSupabaseAccessJwt(session.access, supabaseProjectRef()) &&
    payload?.exp &&
    payload.exp * 1000 > Date.now()
  ) {
    return NextResponse.redirect(new URL("/dashboard", url));
  }

  const rotated = await rotateCookieSession();
  if (!rotated) {
    return NextResponse.redirect(new URL("/signup", url));
  }

  if (rotated.error) {
    const res = NextResponse.redirect(new URL("/signup", url));
    res.cookies.set(AUTH_COOKIE, "", CLEAR_COOKIE_OPTS);
    return res;
  }

  const res = NextResponse.redirect(new URL("/dashboard", url));
  res.cookies.set(
    AUTH_COOKIE,
    serializeSupabaseCookie({ access: rotated.access, refresh: rotated.refresh }),
    { ...COOKIE_OPTS, maxAge: SESSION_MAX_AGE_SECONDS }
  );
  return res;
}