import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/server/email";
import { createNotification } from "@/lib/server/notifications";
import { logError } from "@/lib/server/log";
import { getPrisma } from "@/lib/db/prisma";
import { CANONICAL_ORIGIN } from "@/lib/server/origin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || CANONICAL_ORIGIN;

  const prisma = getPrisma();
  const events = await prisma.event.findMany({
    where: { startTime: { gte: now, lte: windowEnd } },
    select: { id: true, title: true, startTime: true, roomSlug: true },
  });

  let sent = 0;
  for (const event of events) {
    const start = event.startTime instanceof Date ? event.startTime : new Date(event.startTime);
    const hoursUntil = (start.getTime() - now.getTime()) / (60 * 60 * 1000);
    const joinHref = event.roomSlug ? `/rooms/${event.roomSlug}` : `/events`;

    const rsvps = await prisma.rsvp.findMany({
      where: { eventId: event.id },
      select: { userId: true },
    });
    for (const rsvp of rsvps) {
      const alreadyReminded = await prisma.notification.findFirst({
        where: {
          userId: rsvp.userId,
          type: "event_reminder",
          targetId: event.id,
        },
      });
      if (alreadyReminded) continue;

      const userRow = await prisma.user.findUnique({
        where: { id: rsvp.userId },
        select: { email: true },
      });
      const email = userRow?.email || "";
      try {
        if (email) {
          await sendEmail({
            to: email,
            subject: `Reminder: "${event.title}" starts soon`,
            text:
              `You're going to "${event.title}" — it starts in ${Math.round(hoursUntil)} hour(s) at ` +
              `${start.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.` +
              `\n\nJoin the room: ${baseUrl}${joinHref}`,
          });
        }
        await createNotification({
          userId: rsvp.userId,
          type: "event_reminder",
          actorId: "",
          actorName: "Secret Yarnery",
          targetId: event.id,
          text: `"${event.title}" starts soon — don't miss it.`,
          href: joinHref,
        });
        sent++;
      } catch (err) {
        logError("email.event_reminder_failed", { eventId: event.id, userId: rsvp.userId, error: err.message });
      }
    }
  }

  return NextResponse.json({ sent });
}