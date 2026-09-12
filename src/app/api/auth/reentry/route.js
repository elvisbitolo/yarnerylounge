import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE } from "@/lib/server/auth";
import { parseSessionCookie } from "@/lib/server/auth-core";
import { resolveSession } from "@/lib/server/session-store";
import { rateLimitGuard } from "@/lib/server/rate-limit";

// Silent "already signed in" reentry used by the root page. A returning member
// hits "/" -> this route -> straight to /dashboard with zero form flashes:
//   - no opaque session cookie      -> /signup
//   - session resolves              -> /dashboard (expired access tokens are
//                                       rotated server-side against the
//                                       Session table, no cookie rewrite)
//   - session dead/revoked          -> clear cookie, /signup
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

  const resolved = await resolveSession(sid);
  if (!resolved?.identity) {
    const res = NextResponse.redirect(new URL("/signup", url));
    res.cookies.set(AUTH_COOKIE, "", CLEAR_COOKIE_OPTS);
    return res;
  }

  return NextResponse.redirect(new URL("/dashboard", url));
}