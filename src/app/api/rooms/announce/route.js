import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { getPrisma } from "@/lib/db/prisma";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { resolveRoomAccess } from "@/lib/server/room-access";
import { sendEmail } from "@/lib/server/email";
import { buildLiveEmail } from "@/lib/server/lounge-live-core";
import { logError } from "@/lib/server/log";

export const dynamic = "force-dynamic";

const OWNER_EMAIL = "secretyarnery@gmail.com";

export async function POST(req) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const ownerEmail = String(auth.user.email || auth.userDoc?.email || "").trim().toLowerCase();
  if (ownerEmail !== OWNER_EMAIL) {
    return NextResponse.json({ error: "Only the system owner can send lounge announcements" }, { status: 403 });
  }

  const limited = rateLimitGuard(`room-announce:${auth.user.uid}`, { limit: 1, windowMs: 5 * 60_000 });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const roomId = typeof body?.roomId === "string" ? body.roomId.trim() : "";
  if (!roomId || roomId.length > 128) {
    return NextResponse.json({ error: "Invalid lounge" }, { status: 400 });
  }

  const access = await resolveRoomAccess(roomId, auth.user.uid, auth.userDoc);
  if (access.denied) return access.denied;
  const room = access.room;
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Email service is temporarily unavailable" }, { status: 503 });

  try {
    const recipients = await prisma.user.findMany({
      where: {
        id: { not: auth.user.uid },
        email: { not: null },
        notifications: { not: "off" },
        OR: [{ suspended: false }, { suspended: null }],
      },
      select: { id: true, email: true, notificationPreferences: true },
    });

    const { subject, text } = buildLiveEmail({
      roomName: room.name,
      roomSlug: room.slug,
      appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://www.christasspeakeasy.com",
    });

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    for (let i = 0; i < recipients.length; i += 20) {
      await Promise.all(recipients.slice(i, i + 20).map(async (member) => {
        if (!member.email || member.notificationPreferences?.emailLounge === false) {
          skipped += 1;
          return;
        }
        try {
          const result = await sendEmail({ to: member.email, subject, text });
          if (result?.ok) sent += 1;
          else skipped += 1;
        } catch (error) {
          failed += 1;
          logError("lounge-live.manual_email_failed", {
            userId: member.id,
            roomId: room.id,
            error: error?.message || "Unknown email error",
          });
        }
      }));
    }

    return NextResponse.json({ ok: true, sent, failed, skipped });
  } catch (error) {
    logError("lounge-live.manual_announcement_failed", {
      roomId,
      error: error?.message || "Unknown error",
    });
    return NextResponse.json({ error: "Could not send lounge announcement" }, { status: 500 });
  }
}
