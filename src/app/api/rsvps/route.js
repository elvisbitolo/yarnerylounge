import { NextResponse } from "next/server";
import { logError } from "@/lib/server/log";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getAccessSub, isActiveSub } from "@/lib/server/subscription";
import { createNotification } from "@/lib/server/notifications";
import { sendEmail } from "@/lib/server/email";
import { awardPoints, POINTS } from "@/lib/server/gamification";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { applyRsvpCounts } from "@/lib/server/events-core";
import { runAutomations } from "@/lib/server/automations";
import { getPrisma } from "@/lib/db/prisma";

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const sub = await getAccessSub(user.uid);
  if (!isActiveSub(sub)) {
    return NextResponse.json({ error: "Active membership required" }, { status: 403 });
  }

  const limited = rateLimitGuard(`rsvp:${user.uid}`, { limit: 10 });
  if (limited) return limited;

  const { eventId, occurrenceId = "" } = await req.json();
  if (!eventId || typeof eventId !== "string") {
    return NextResponse.json({ error: "Event required" }, { status: 400 });
  }

  const userDoc = await getUserDoc(user.uid);
  const memberName = userDoc?.name || user.name || user.email?.split("@")[0] || "Member";

  const rsvpKey = occurrenceId || eventId;
  const rsvpId = `${rsvpKey}_${user.uid}`;
  const countKey = occurrenceId || "_";

  let joined = null;
  let event = null;
  try {
    const prisma = getPrisma();
    event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const existing = await prisma.rsvp.findUnique({ where: { id: rsvpId } });
    if (existing) {
      const { counts } = applyRsvpCounts(event.capacityCounts, countKey, event.capacity, false);
      if (JSON.stringify(counts) !== JSON.stringify(event.capacityCounts || {})) {
        await prisma.event.update({
          where: { id: eventId },
          data: { capacityCounts: counts },
        });
      }
      await prisma.rsvp.delete({ where: { id: rsvpId } });
      joined = false;
    } else {
      const capacity = Number(event.capacity) || 0;
      const { full, counts } = applyRsvpCounts(
        event.capacityCounts,
        countKey,
        capacity,
        true
      );
      if (full) {
        return NextResponse.json({ error: "This event is full" }, { status: 409 });
      }

      await prisma.rsvp.create({
        data: {
          id: rsvpId,
          eventId,
          occurrenceId,
          userId: user.uid,
          name: memberName,
        },
      });
      if (capacity > 0) {
        await prisma.event.update({
          where: { id: eventId },
          data: { capacityCounts: counts },
        });
      }
      joined = true;
    }
  } catch (err) {
    logError("rsvp.prisma_txn_failed", { error: err.message });
    return NextResponse.json({ error: "RSVP failed" }, { status: 500 });
  }

  if (!joined) {
    return NextResponse.json({ joined: false });
  }

  await awardPoints(user.uid, POINTS.RSVP, memberName).catch((err) => {
    logError("gamification.rsvp_failed", { uid: user.uid, eventId, error: err.message });
  });

  runAutomations("event_rsvp", {
    rsvpName: memberName,
    rsvpUid: user.uid,
    eventTitle: event?.title || "",
    eventId,
    subjectUid: user.uid,
    subjectName: memberName,
  }).catch((err) => {
    logError("automation.event_rsvp_failed", { eventId, uid: user.uid, error: err.message });
  });

  if (event.createdBy && event.createdBy !== user.uid) {
    await createNotification({
      userId: event.createdBy,
      type: "rsvp",
      actorId: user.uid,
      actorName: memberName,
      targetId: eventId,
      href: `/events`,
      text: `RSVP'd to "${event.title}"`,
    });

    const creatorDoc = await getUserDoc(event.createdBy);
    if (creatorDoc) {
      const creator = creatorDoc;
      if (creator.email && creator.notifications !== "off") {
        await sendEmail({
          to: creator.email,
          subject: `New RSVP for "${event.title}"`,
          text: `${memberName} is going to "${event.title}".\n\nView RSVPs on the events page.`,
        }).catch((err) => {
          logError("email.rsvp_notify_failed", { eventId, to: creator.email, error: err.message });
        });
      }
    }
  }

  return NextResponse.json({ joined: true });
}