import { NextResponse } from "next/server";
import { listEvents, createEvent } from "@/lib/server/events";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { canModerate } from "@/lib/server/auth";
import { canManageScope } from "@/lib/server/hosts";
import { getRoomBySlug } from "@/lib/server/rooms";
import { logAudit } from "@/lib/server/audit";
import { getSpace } from "@/lib/server/spaces";
import { serialize } from "@/lib/server/serialize";
import { clean } from "@/lib/server/validate";

export async function GET() {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;
  const events = await listEvents();
  return NextResponse.json({ events: serialize(events) });
}

export async function POST(req) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { title, description = "", startTime, endTime = null, roomSlug = "", capacity = 0, recurrence = null, spaceId = "", purchasePriceCents = 0, publicPreview = false } = await req.json();
  const eventTitle = clean(title, 140);
  const eventDesc = clean(description, 20000);
  if (!eventTitle) {
    return NextResponse.json({ error: "Event title required" }, { status: 400 });
  }
  const parsed = Date.parse(startTime);
  if (!Number.isFinite(parsed)) {
    return NextResponse.json({ error: "A valid start time is required" }, { status: 400 });
  }
  const price = Number(purchasePriceCents) || 0;
  if (price < 0 || price > 1000000) {
    return NextResponse.json({ error: "Invalid price" }, { status: 400 });
  }
  const staff = canModerate(auth.userDoc);
  if (spaceId) {
    const space = await getSpace(spaceId);
    if (!space || space.status !== "active") {
      return NextResponse.json({ error: "Space not found" }, { status: 404 });
    }
  }
  if (!staff) {
    let allowed = false;
    if (spaceId) allowed = await canManageScope(auth.user.uid, "space", spaceId);
    if (!allowed && roomSlug) {
      const room = await getRoomBySlug(roomSlug);
      if (room) allowed = await canManageScope(auth.user.uid, "room", room.id);
    }
    if (!allowed) {
      return NextResponse.json(
        { error: "Only staff or the host of the space or lounge can schedule events" },
        { status: 403 }
      );
    }
  }

  const event = await createEvent({
    title: eventTitle,
    description: eventDesc,
    startTime,
    endTime,
    roomSlug,
    capacity,
    recurrence,
    spaceId,
    purchasePriceCents: price,
    publicPreview,
    createdBy: auth.user.uid,
  });

  await logAudit({
    actorId: auth.user.uid,
    actorName: auth.userDoc?.name || auth.user.email || "",
    action: "event.created",
    targetId: event.id,
    metadata: { title: eventTitle, startTime, spaceId, recurrence, purchasePriceCents: price },
  });

  return NextResponse.json({ event });
}
