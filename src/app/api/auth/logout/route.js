import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE, getCurrentUserStatus, getUserDoc } from "@/lib/server/auth";
import { parseSessionCookie } from "@/lib/server/auth-core";
import { SESSION_OK, deleteSession, getSessionRow } from "@/lib/server/session-store";
import {
  canUseSwitcher,
  canUseSwitcherSession,
  deleteSwitchGroupSessions,
  getSwitchRoot,
  tagSessionForSwitch,
} from "@/lib/server/account-switch";
import { logError } from "@/lib/server/log";

const CLEAR_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 0,
};

async function revokeAccessToken(accessToken) {
  if (!accessToken) return;
  try {
    const { default: supabaseAdmin } = await import("@/lib/supabase/service");
    await supabaseAdmin.auth.admin.signOut(accessToken);
  } catch (err) {
    logError("auth.logout_revoke_failed", { error: err.message });
  }
}

// Explicit sign-out (and only this) ends a session: revokes the Supabase
// access token server-side, deletes the Session row and clears the cookie.
// `{ all: true }` also removes every saved session in the current owner group.
export async function POST(req) {
  let body = {};
  try {
    body = await req.json();
  } catch {
    // no body is the normal per-account sign-out
  }
  const all = body?.all === true;

  const sid = parseSessionCookie((await cookies()).get(AUTH_COOKIE)?.value)?.sid;

  if (all) {
    const current = await getCurrentUserStatus();
    if (current.status === SESSION_OK) {
      const realUid = current.identity.actorUid || current.identity.uid;
      const userDoc = await getUserDoc(realUid);
      const root = await getSwitchRoot(userDoc);
      const canClearGroup =
        root &&
        canUseSwitcher(root.rootDoc) &&
        (await canUseSwitcherSession({ sid, rootId: root.rootId, realUid }));
      if (root && canClearGroup) {
        await tagSessionForSwitch(sid, root.rootId);
        const rows = await getSwitchGroupRows(root.rootId);
        for (const row of rows) {
          await revokeAccessToken(row.accessToken);
        }
        await deleteSwitchGroupSessions(root.rootId);
      } else if (sid) {
        // A child account may not wipe its owner's saved sessions.
        const row = await getSessionRow(sid);
        await revokeAccessToken(row?.accessToken);
        await deleteSession(sid);
      }
    } else if (sid) {
      const row = await getSessionRow(sid);
      await revokeAccessToken(row?.accessToken);
      await deleteSession(sid);
    }
  } else if (sid) {
    const row = await getSessionRow(sid);
    await revokeAccessToken(row?.accessToken);
    await deleteSession(sid);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", CLEAR_COOKIE);
  return res;
}

async function getSwitchGroupRows(rootId) {
  try {
    const { getPrisma } = await import("@/lib/db/prisma");
    const prisma = getPrisma();
    if (!prisma) return [];
    return await prisma.session.findMany({
      where: { switchOwnerId: rootId },
      select: { accessToken: true },
    });
  } catch (err) {
    logError("auth.logout_group_read_failed", { error: err.message });
    return [];
  }
}
