import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE, getCurrentUserStatus, getUserDoc } from "@/lib/server/auth";
import { parseSessionCookie, serializeSessionCookie, SESSION_MAX_AGE_SECONDS } from "@/lib/server/auth-core";
import { SESSION_OK } from "@/lib/server/session-store";
import { getPrisma } from "@/lib/db/prisma";
import { logAudit } from "@/lib/server/audit";
import { assertSameOrigin } from "@/lib/server/same-origin";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import {
  canUseSwitcher,
  canUseSwitcherSession,
  findSwitchSession,
  getSwitchRoot,
  tagSessionForSwitch,
} from "@/lib/server/account-switch";

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

  const current = await getCurrentUserStatus();
  if (current.status !== SESSION_OK) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const limited = rateLimitGuard(`account-switch:${current.identity.uid}`, { limit: 30 });
  if (limited) return limited;

  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const targetUid = String(body?.userId || "").trim();
  if (!targetUid) {
    return NextResponse.json({ error: "Missing account" }, { status: 400 });
  }

  const realUid = current.identity.actorUid || current.identity.uid;
  const userDoc = await getUserDoc(realUid);
  const currentSid = parseSessionCookie((await cookies()).get(AUTH_COOKIE)?.value)?.sid;
  const root = await getSwitchRoot(userDoc);
  if (
    !root ||
    !canUseSwitcher(root.rootDoc) ||
    !(await canUseSwitcherSession({ sid: currentSid, rootId: root.rootId, realUid }))
  ) {
    return NextResponse.json({ error: "Account switching is not enabled" }, { status: 403 });
  }

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const target = await prisma.user.findUnique({
    where: { id: targetUid },
    select: { id: true, name: true, email: true, ownerId: true, suspended: true },
  });
  if (!target || target.suspended) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  if (target.id !== root.rootId && target.ownerId !== root.rootId) {
    return NextResponse.json({ error: "That account is not linked to you" }, { status: 403 });
  }

  const session = await findSwitchSession(root.rootId, target.id);
  if (!session) {
    return NextResponse.json(
      { error: "Sign in to that account once to add it to your switcher." },
      { status: 409 }
    );
  }

  await tagSessionForSwitch(currentSid, root.rootId);

  await logAudit({
    actorId: realUid,
    actorName: userDoc?.name || userDoc?.email || "",
    action: "account.switch",
    targetId: target.id,
    metadata: { from: realUid, rootId: root.rootId, to: target.email || "" },
  });

  const res = NextResponse.json({ ok: true, uid: target.id });
  res.cookies.set(AUTH_COOKIE, serializeSessionCookie(session.id), SESSION_COOKIE);
  return res;
}
