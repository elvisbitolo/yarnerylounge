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
  const targetId = typeof body.targetId === "string" ? body.targetId.trim() : "";
  const action = body.action;
  const kind = action === "block" || action === "unblock" ? "block" : action === "mute" || action === "unmute" ? "mute" : "";
  if (!targetId || targetId === auth.user.uid || !kind) {
    return NextResponse.json({ error: "Invalid member action" }, { status: 400 });
  }
  try {
    const target = await getPrisma().user.findUnique({ where: { id: targetId }, select: { id: true } });
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
