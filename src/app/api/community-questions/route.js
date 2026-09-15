import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import {
  listCommunityQuestions,
  createCommunityQuestion,
  cleanQuestionParts,
} from "@/lib/server/community-questions";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "";
  const questions = await listCommunityQuestions({ status });

  return NextResponse.json({ questions });
}

export async function POST(req) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`community_questions:${auth.user.uid}`, { limit: 10 });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const { cleanTitle, cleanBody } = cleanQuestionParts(body);

  if (!cleanTitle) {
    return NextResponse.json({ error: "Give your question a short title" }, { status: 400 });
  }
  if (!cleanBody) {
    return NextResponse.json({ error: "Describe what you need help with" }, { status: 400 });
  }

  const userDoc = auth.userDoc || {};
  const { id } = await createCommunityQuestion({
    authorId: auth.user.uid,
    authorName: userDoc.name || auth.user.displayName || "Member",
    title: cleanTitle,
    body: cleanBody,
  });

  if (!id) {
    return NextResponse.json({ error: "Could not post your question" }, { status: 500 });
  }

  return NextResponse.json({ id });
}