import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE } from "@/lib/server/auth";
import { parseSessionCookie } from "@/lib/server/auth-core";
import { deleteSession, getSessionRow } from "@/lib/server/session-store";
import { logError } from "@/lib/server/log";

// Explicit sign-out (and only this) ends a session: revokes the Supabase
// access token server-side, deletes the Session row and clears the cookie.
export async function POST() {
  const sid = parseSessionCookie((await cookies()).get(AUTH_COOKIE)?.value)?.sid;

  if (sid) {
    const row = await getSessionRow(sid);
    if (row?.accessToken) {
      try {
        const { default: supabaseAdmin } = await import("@/lib/supabase/service");
        await supabaseAdmin.auth.admin.signOut(row.accessToken);
      } catch (err) {
        logError("auth.logout_revoke_failed", { error: err.message });
      }
    }
    await deleteSession(sid);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}