import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { canAccessPost } from "@/lib/server/posts";
import { getCapabilities, canWriteChat } from "@/lib/server/capabilities";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { httpStatusFor } from "@/lib/server/http-errors";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function GET(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const userDoc = await getUserDoc(user.uid);
  const access = await canAccessPost(id, user.uid, userDoc);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const limited = rateLimitGuard(`vote-read:${user.uid}`, { limit: 120 });
  if (limited) return limited;
  const post = access.post;
  if (post.kind !== "poll" || !Array.isArray(post.pollOptions)) {
    return NextResponse.json({ votedOption: undefined });
  }
  try {
    const prisma = getPrisma();
    const vote = await prisma.pollVote.findUnique({
      where: { id: `${id}_${user.uid}` },
    });
    return NextResponse.json({ votedOption: vote?.option });
  } catch (err) {
    logError("posts.vote.prisma_read_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to load vote" }, { status: 500 });
  }
}

export async function POST(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const userDoc = await getUserDoc(user.uid);
  const caps = await getCapabilities(user.uid);
  if (!canWriteChat(caps) && !(userDoc?.role === "owner" || userDoc?.role === "moderator")) {
    return NextResponse.json({ error: "Live interaction requires an active membership" }, { status: 403 });
  }
  const access = await canAccessPost(id, user.uid, userDoc);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const limited = rateLimitGuard(`vote:${user.uid}`, { limit: 30 });
  if (limited) return limited;
  const post = access.post;
  if (post.kind !== "poll" || !Array.isArray(post.pollOptions)) {
    return NextResponse.json({ error: "Invalid poll option" }, { status: 400 });
  }

  if (post.pollDeadline) {
    const deadlineMs = new Date(post.pollDeadline).getTime();
    if (!isNaN(deadlineMs) && Date.now() >= deadlineMs) {
      return NextResponse.json({ error: "Voting is closed" }, { status: 400 });
    }
  }

  const { option } = await req.json();
  if (typeof option !== "number" || option < 0 || option >= post.pollOptions.length) {
    return NextResponse.json({ error: "Invalid poll option" }, { status: 400 });
  }

  try {
    const prisma = getPrisma();
    const result = await prisma.$transaction(async (tx) => {
      const postRow = await tx.post.findUnique({ where: { id } });
      if (!postRow) throw Object.assign(new Error("Post not found"), { code: 404 });
      if (postRow.kind !== "poll" || !Array.isArray(postRow.pollOptions) || option >= postRow.pollOptions.length) {
        throw Object.assign(new Error("Invalid poll option"), { code: 400 });
      }
      const existing = await tx.pollVote.findUnique({ where: { id: `${id}_${user.uid}` } });
      if (existing) {
        throw Object.assign(new Error("You already voted"), { code: 409 });
      }
      const counts = { ...(postRow.pollCounts || {}) };
      counts[option] = (counts[option] || 0) + 1;
      await tx.pollVote.create({
        data: { id: `${id}_${user.uid}`, postId: id, userId: user.uid, option },
      });
      await tx.post.update({
        where: { id },
        data: { pollCounts: counts, pollTotal: (postRow.pollTotal || 0) + 1, lastActivityAt: new Date() },
      });
      return { counts, votedOption: option };
    });
    return NextResponse.json(result);
  } catch (err) {
    const status = httpStatusFor(err);
    return NextResponse.json(
      { error: status === 409 ? "You already voted" : err.message || "Vote failed" },
      { status }
    );
  }
}