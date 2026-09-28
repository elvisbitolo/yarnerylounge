import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE } from "@/lib/server/auth";
import { parseSessionCookie } from "@/lib/server/auth-core";
import {
  resolveSessionStatus,
  SESSION_OK,
  SESSION_UNAVAILABLE,
} from "@/lib/server/session-store";
import { rateLimitGuard } from "@/lib/server/rate-limit";

// Silent "already signed in" reentry used by the root page. A returning member
// hits "/" -> this route -> straight to /dashboard with zero form flashes:
//   - no opaque session cookie      -> /signup
//   - session resolves              -> /dashboard (expired access tokens are
//                                       rotated server-side against the
//                                       Session table, no cookie rewrite)
//   - session dead/revoked          -> clear cookie, /signup
//   - store unreachable            -> /dashboard, cookie left alone. Every
//                                       homepage visit comes through here, so
//                                       clearing on a transient fault meant one
//                                       bad second could sign a member out.
const CLEAR_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 0,
};

export async function GET(req) {
  const url = new URL(req.url);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = rateLimitGuard(`reentry-ip:${ip}`, { limit: 120, windowMs: 60_000 });
  if (limited) return NextResponse.redirect(new URL("/login", url));

  const sid = parseSessionCookie((await cookies()).get(AUTH_COOKIE)?.value)?.sid;
  if (!sid) {
    return NextResponse.redirect(new URL("/signup", url));
  }

  const resolved = await resolveSessionStatus(sid);
  if (resolved.status === SESSION_UNAVAILABLE) {
    // Could not confirm the session. Assume the member is signed in and let the
    // app itself retry — far better than destroying the cookie and dropping a
    // live member on the sign-up form because of a momentary outage.
    return NextResponse.redirect(new URL("/dashboard", url));
  }

  if (resolved.status !== SESSION_OK) {
    const res = NextResponse.redirect(new URL("/signup", url));
    res.cookies.set(AUTH_COOKIE, "", CLEAR_COOKIE_OPTS);
    return res;
  }

  return NextResponse.redirect(new URL("/dashboard", url));
}