import { NextResponse } from "next/server";
import { getRoom } from "@/lib/server/rooms";
import { requireScopeHost, guardJson } from "@/lib/server/authorize";
import {
  removeLiveParticipant,
  setLiveParticipantPublish,
  muteLiveParticipant,
  listLiveParticipants,
} from "@/lib/server/livekit";
import { logAudit } from "@/lib/server/audit";

export const MAX_SPEAKERS = 9;

export async function POST(req, { params }) {
  const { id, identity } = await params;
  const auth = await requireScopeHost({ scopeType: "room", scopeId: id });
  const denied = guardJson(auth);
  if (denied) return denied;

  const room = await getRoom(id);
  if (!room || room.status !== "active") {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const { action } = await req.json();
  if (!["remove", "viewer", "speaker", "mute"].includes(action)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  if (action === "speaker") {
    const live = await listLiveParticipants(room.slug);
    const speakerCount = live.filter((p) => p.canPublish !== false).length;
    const isTargetingNewSpeaker = live.some((p) => p.identity === identity && p.canPublish === false);
    if (isTargetingNewSpeaker && speakerCount >= MAX_SPEAKERS) {
      return NextResponse.json(
        { error: `Room is full — max ${MAX_SPEAKERS} speakers on stage.` },
        { status: 409 }
      );
    }
  }

  let result;
  try {
    if (action === "remove") {
      result = await removeLiveParticipant(room.slug, identity);
    } else if (action === "mute") {
      result = await muteLiveParticipant(room.slug, identity);
    } else {
      result = await setLiveParticipantPublish(
        room.slug,
        identity,
        action === "speaker"
      );
    }
  } catch {
    result = { ok: false, error: "Could not update participant" };
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  await logAudit({
    actorId: auth.user.uid,
    actorName: auth.userDoc?.name || auth.user.email || "",
    action: `room.participant.${action}`,
    targetId: room.id,
    metadata: { roomSlug: room.slug, identity },
  });

  return NextResponse.json({ ok: true });
}
