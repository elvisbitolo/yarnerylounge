import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { acceptCommunityAnswer } from "@/lib/server/community-questions";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`community_accept:${auth.user.uid}`, { limit: 30 });
  if (limited) return limited;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  if (typeof body.answerId !== "string" || !body.answerId) {
    return NextResponse.json({ error: "Choose an answer to accept" }, { status: 400 });
  }

  const result = await acceptCommunityAnswer({
    questionId: id,
    answerId: body.answerId,
    requesterId: auth.user.uid,
  });

  if (result.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: result.error }, { status: result.status || 500 });
}