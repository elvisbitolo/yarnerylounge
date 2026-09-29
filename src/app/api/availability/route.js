import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { createEvent } from "@/lib/server/events";
import { getAccessSub } from "@/lib/server/subscription";
import {
  createAvailability,
  listAvailability,
  AVAILABILITY_MAX_TITLE,
  AVAILABILITY_MAX_NOTE,
  AVAILABILITY_MAX_MINUTES,
  AVAILABILITY_MIN_MINUTES,
  normalizeRecurring,
  normalizeTimeZone,
  linkAvailabilityEvent,
} from "@/lib/server/availability";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const url = new URL(req.url);
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const availability = await listAvailability({ from, to });
  return NextResponse.json({ availability });
}

export async function POST(req) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const body = await req.json();
  const title = (typeof body.title === "string" ? body.title : "").trim().slice(0, AVAILABILITY_MAX_TITLE);
  const note = (typeof body.note === "string" ? body.note : "").trim().slice(0, AVAILABILITY_MAX_NOTE);
  const roomSlug = typeof body.roomSlug === "string" ? body.roomSlug.trim().slice(0, 60) : "";
  const startAt = Date.parse(body.startAt);
  const endAt = Date.parse(body.endAt);

  if (!title) return NextResponse.json({ error: "Add a short title for your availability block" }, { status: 400 });
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) {
    return NextResponse.json({ error: "Pick a valid start and end time" }, { status: 400 });
  }
  const minutes = Math.round((endAt - startAt) / 60000);
  if (minutes < AVAILABILITY_MIN_MINUTES) {
    return NextResponse.json({ error: `Blocks must be at least ${AVAILABILITY_MIN_MINUTES} minutes long` }, { status: 400 });
  }
  if (minutes > AVAILABILITY_MAX_MINUTES) {
    return NextResponse.json({ error: "Blocks can't be longer than 24 hours" }, { status: 400 });
  }

  const sub = await getAccessSub(auth.user.uid);
  const userDoc = auth.userDoc || {};

  // The form built its ISO string in the browser's own zone, so the browser's
  // zone is what that string meant. Fall back to the stored profile zone.
  const timeZone = normalizeTimeZone(body.timeZone) || normalizeTimeZone(userDoc.timezone);

  // Opt-in promotion: the block is created first, then a meetup is derived from
  // it and the two are linked. Doing it in this order means a failure while
  // creating the event leaves a usable block rather than nothing.
  const recurring = normalizeRecurring(body.recurring);
  const created = await createAvailability({
    userId: auth.user.uid,
    userName: userDoc.name || auth.user.displayName || "Member",
    userAvatar: userDoc.avatar || userDoc.photoURL || "",
    title,
    note,
    roomSlug,
    startAt,
    endAt,
    timeZone,
    recurring,
  });
  const blockId = typeof created === "object" ? created.id : created;

  let eventId = null;
  if (blockId && body.makeEvent === true) {
    const event = await createEvent({
      title,
      description: note,
      // startAt/endAt are the validated epoch-ms values parsed at the top of the
      // handler; body.startAt/body.endAt are the raw strings and are unvalidated.
      startTime: startAt,
      endTime: endAt,
      roomSlug,
      capacity: 0,
      // The block is the source of truth for recurrence, so the meetup repeats
      // on the same cadence rather than becoming a single occurrence.
      recurrence: recurring === "none" ? null : { freq: "weekly", interval: 1, count: 52 },
      createdBy: auth.user.uid,
      source: "availability",
    });
    eventId = event.id || null;
    if (eventId) await linkAvailabilityEvent(blockId, eventId);
  }

  return NextResponse.json({ id: blockId, eventId, subTier: sub.tier });
}