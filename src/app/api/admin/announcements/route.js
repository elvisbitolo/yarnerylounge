import { NextResponse } from "next/server";
import { requireModerator, requireUser, guardJson } from "@/lib/server/authorize";
import { getScopedHostRights } from "@/lib/server/hosts";
import { sendAnnouncement, listAnnouncements, ANNOUNCEMENT_MAX } from "@/lib/server/announcements";
import { logAudit } from "@/lib/server/audit";
import { rateLimitGuard } from "@/lib/server/rate-limit";

const AUDIENCES = ["community", "space", "group", "room"];

function isStaff(auth) {
  return auth.userDoc?.role === "owner" || auth.userDoc?.role === "moderator";
}

export async function GET(req) {
  const auth = await requireModerator();
  const denied = guardJson(auth);
  if (denied) return denied;

  const announcements = await listAnnouncements(20);
  return NextResponse.json({ announcements });
}

export async function POST(req) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { audience, scopeId, message } = await req.json();

  if (!AUDIENCES.includes(audience)) {
    return NextResponse.json({ error: "Audience must be community, space, group, or lounge" }, { status: 400 });
  }
  if (audience !== "community" && !scopeId) {
    return NextResponse.json({ error: "A scope is required for this audience" }, { status: 400 });
  }

  const staff = isStaff(auth);
  if (audience === "community") {
    if (!staff) {
      return NextResponse.json({ error: "Staff access required for community announcements" }, { status: 403 });
    }
  } else {
    const rights = await getScopedHostRights(auth.user.uid, audience, scopeId);
    if (!staff && !rights.isHost) {
      return NextResponse.json({ error: "Host access required for this scope" }, { status: 403 });
    }
  }

  const limited = rateLimitGuard("announcement", { limit: 10, windowMs: 3600 * 1000 });
  if (limited) return limited;

  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Announcement message required" }, { status: 400 });
  }
  if (message.length > ANNOUNCEMENT_MAX) {
    return NextResponse.json({ error: `Message too long (max ${ANNOUNCEMENT_MAX} chars)` }, { status: 400 });
  }

  const result = await sendAnnouncement({
    scopeType: audience,
    scopeId: audience === "community" ? "" : scopeId,
    message,
    actorId: auth.user.uid,
    actorName: auth.userDoc?.name || auth.user.email || "",
  });

  await logAudit({
    actorId: auth.user.uid,
    actorName: auth.userDoc?.name || auth.user.email || "",
    action: "announcement.sent",
    metadata: { audience, scopeId: scopeId || "", sentCount: result.sentCount },
  });

  return NextResponse.json({ ok: true, sentCount: result.sentCount });
}
