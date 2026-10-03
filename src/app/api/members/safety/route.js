import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { getPrisma } from "@/lib/db/prisma";
import { getMemberSafety, setMemberSafety } from "@/lib/server/member-safety";
import { rateLimitGuard } from "@/lib/server/rate-limit";

export async function GET(req) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;
  const targetId = new URL(req.url).searchParams.get("targetId") || "";
  if (!targetId || targetId === auth.user.uid) return NextResponse.json({ error: "Member required" }, { status: 400 });
  return NextResponse.json(await getMemberSafety(auth.user.uid, targetId));
}

export async function POST(req) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;
  const limited = rateLimitGuard(`member-safety:${auth.user.uid}`, { limit: 30 });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const action = body.action;
  const kind = action === "block" || action === "unblock" ? "block" : action === "mute" || action === "unmute" ? "mute" : "";
  if (!kind) {
    return NextResponse.json({ error: "Invalid member action" }, { status: 400 });
  }

  try {
    const prisma = getPrisma();

    // The lounge only knows a participant's display name and email, so accept an
    // email as an alternative to the id. Jitsi already exposes participant
    // emails to everyone in the room, so this is not a new disclosure.
    let targetId = typeof body.targetId === "string" ? body.targetId.trim() : "";
    const targetEmail = typeof body.email === "string" ? body.email.trim() : "";
    if (!targetId && targetEmail) {
      const byEmail = await prisma.user.findFirst({
        where: { email: { equals: targetEmail, mode: "insensitive" } },
        select: { id: true },
      });
      targetId = byEmail?.id || "";
    }
    if (!targetId || targetId === auth.user.uid) {
      return NextResponse.json({ error: "Invalid member action" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    const safety = await setMemberSafety(auth.user.uid, targetId, kind, !action.startsWith("un"));
    return NextResponse.json(safety);
  } catch (err) {
    if (err.message === "INVALID_MEMBER" || err.message === "INVALID_SAFETY_ACTION") {
      return NextResponse.json({ error: "Invalid member action" }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not update member preferences" }, { status: 500 });
  }
}
