import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { canModerate } from "@/lib/server/auth";
import { getAccessSub } from "@/lib/server/subscription";
import { getCapabilities, canUseMatchmaker } from "@/lib/server/capabilities";
import {
  createAvailability,
  listAvailability,
  AVAILABILITY_MAX_TITLE,
  AVAILABILITY_MAX_NOTE,
  AVAILABILITY_MAX_MINUTES,
  AVAILABILITY_MIN_MINUTES,
} from "@/lib/server/availability";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const caps = await getCapabilities(auth.user.uid);
  if (!canUseMatchmaker(caps) && !canModerate(auth.userDoc)) {
    return NextResponse.json({ error: "The matchmaker calendar is a Hooking Up + perk" }, { status: 403 });
  }

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

  const caps = await getCapabilities(auth.user.uid);
  if (!canUseMatchmaker(caps) && !canModerate(auth.userDoc)) {
    return NextResponse.json({ error: "The matchmaker calendar is a Hooking Up + perk" }, { status: 403 });
  }

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

  const id = await createAvailability({
    userId: auth.user.uid,
    userName: userDoc.name || auth.user.displayName || "Member",
    userAvatar: userDoc.avatar || userDoc.photoURL || "",
    title,
    note,
    roomSlug,
    startAt,
    endAt,
    recurring: body.recurring === "weekly" ? "weekly" : "none",
  });

  return NextResponse.json({ id, subTier: sub.tier });
}