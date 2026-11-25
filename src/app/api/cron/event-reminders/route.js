import { NextResponse } from "next/server";
import { createNotification } from "@/lib/server/notifications";
import { logError } from "@/lib/server/log";
import { getPrisma } from "@/lib/db/prisma";
import { getUserDoc } from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const prisma = getPrisma();
  const events = await prisma.event.findMany({
    where: { startTime: { gte: now, lte: windowEnd } },
    select: { id: true, title: true, startTime: true, roomSlug: true },
  });

  let sent = 0;
  for (const event of events) {
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

      const memberDoc = await getUserDoc(rsvp.userId);
      if (
        memberDoc?.notifications === "off" ||
        memberDoc?.notificationPreferences?.events === false
      ) {
        continue;
      }

      try {
        await createNotification({
          userId: rsvp.userId,
          type: "event_reminder",
          actorId: null,
          actorName: "Secret Yarnery",
          targetId: event.id,
          text: `"${event.title}" starts soon — don't miss it.`,
          href: joinHref,
        });
        sent++;
      } catch (err) {
        logError("event_reminder.failed", { eventId: event.id, userId: rsvp.userId, error: err.message });
      }
    }
  }

  return NextResponse.json({ sent });
}