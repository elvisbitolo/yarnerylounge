import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { createEvent } from "@/lib/server/events";
import { getAccessSub } from "@/lib/server/subscription";
import {
  createAvailability,
  listAvailability,
  parseAvailabilityInput,
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
  const parsed = parseAvailabilityInput(body);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { title, note, roomSlug, startAt, endAt, recurring } = parsed;

  const sub = await getAccessSub(auth.user.uid);
  const userDoc = auth.userDoc || {};

  // The form built its ISO string in the browser's own zone, so the browser's
  // zone is what that string meant. Fall back to the stored profile zone.
  // The stored zone lives in the User.timezone column for anyone onboarded
  // since it started being written, and in extra.timezone for everyone onboarded
  // before that. Check both, or the "stored profile zone" fallback silently
  // never fires for existing members.
  const storedZone = userDoc.timezone || (userDoc.extra && typeof userDoc.extra === "object" ? userDoc.extra.timezone : "");
  const timeZone = parsed.timeZone || normalizeTimeZone(storedZone);

  // Opt-in promotion: the block is created first, then a meetup is derived from
  // it and the two are linked. Doing it in this order means a failure while
  // creating the event leaves a usable block rather than nothing.
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
      // startAt/endAt are the validated epoch-ms values from
      // parseAvailabilityInput; body.startAt/body.endAt are raw strings.
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