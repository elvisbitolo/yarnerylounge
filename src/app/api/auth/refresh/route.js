import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE } from "@/lib/server/auth";
import { parseSessionCookie } from "@/lib/server/auth-core";
import { resolveSession } from "@/lib/server/session-store";
import { assertSameOrigin } from "@/lib/server/same-origin";
import { rateLimitGuard } from "@/lib/server/rate-limit";

// Confirms the httpOnly session cookie still resolves to a live server-side
// session. Rotation happens inside resolveSession against the Session table,
// so this endpoint never needs to rewrite the cookie — the browser's sid stays
// stable for the whole 14-day sliding window.
export async function POST(req) {
  const crossOrigin = assertSameOrigin(req);
  if (crossOrigin) return crossOrigin;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = rateLimitGuard(`refresh-ip:${ip}`, { limit: 60 });
  if (limited) return limited;

  const sid = parseSessionCookie((await cookies()).get(AUTH_COOKIE)?.value)?.sid;
  const resolved = sid ? await resolveSession(sid) : null;

  if (!resolved?.identity) {
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

  return NextResponse.json({ ok: true, uid: resolved.identity.uid });
}