import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getCommunityQuestion, deleteCommunityQuestion } from "@/lib/server/community-questions";

export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { id } = await params;
  const question = await getCommunityQuestion(id);
  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  return NextResponse.json({ question });
}

export async function DELETE(_req, { params }) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`community_questions_delete:${auth.user.uid}`, { limit: 20 });
  if (limited) return limited;

  const { id } = await params;
  const result = await deleteCommunityQuestion({
    id,
    requesterId: auth.user.uid,
    requesterDoc: auth.userDoc,
  });

  if (result.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: result.error }, { status: result.status });
}