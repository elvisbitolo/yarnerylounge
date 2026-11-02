import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { getPrisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/server/email";
import { buildLiveEmail } from "@/lib/server/lounge-live-core";
import { logError } from "@/lib/server/log";

export async function POST(req) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;
  const email = String(auth.user.email || auth.userDoc?.email || "").trim().toLowerCase();
  if (email !== "secretyarnery@gmail.com") return NextResponse.json({ error: "Only the system owner can send lounge announcements" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const roomId = typeof body.roomId === "string" ? body.roomId : "";
  const prisma = getPrisma();
  if (!prisma || !roomId) return NextResponse.json({ error: "Invalid lounge" }, { status: 400 });
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true, name: true, slug: true } });
  if (!room) return NextResponse.json({ error: "Lounge not found" }, { status: 404 });
  const recipients = await prisma.user.findMany({ where: { email: { not: null }, notifications: { not: "off" }, suspended: { not: true } }, select: { id: true, email: true, notificationPreferences: true } });
  const { subject, text } = buildLiveEmail({ roomName: room.name, roomSlug: room.slug, appUrl: process.env.NEXT_PUBLIC_APP_URL });
  let sent = 0, failed = 0;
  for (let i = 0; i < recipients.length; i += 25) await Promise.all(recipients.slice(i, i + 25).map(async (member) => {
    if (!member.email || member.notificationPreferences?.emailLounge === false) return;
    try { await sendEmail({ to: member.email, subject, text }); sent += 1; }
    catch (error) { failed += 1; logError("lounge-live.manual_email_failed", { userId: member.id, error: error.message }); }
  }));
  return NextResponse.json({ ok: true, sent, failed, skipped: recipients.length - sent - failed });
}
