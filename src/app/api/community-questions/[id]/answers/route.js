import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { addCommunityAnswer, cleanAnswerBody } from "@/lib/server/community-questions";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`community_answers:${auth.user.uid}`, { limit: 30 });
  if (limited) return limited;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const clean = cleanAnswerBody(body.answer);

  if (!clean) {
    return NextResponse.json({ error: "Write an answer first" }, { status: 400 });
  }

  const userDoc = auth.userDoc || {};
  const result = await addCommunityAnswer({
    questionId: id,
    authorId: auth.user.uid,
    authorName: userDoc.name || auth.user.displayName || "Member",
    body: clean,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status || 500 });
  }

  return NextResponse.json({ id: result.id });
}