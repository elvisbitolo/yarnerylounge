import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { adminDb } from "@/lib/firebase/admin";
import { canAccessPost } from "@/lib/server/posts";
import { getCapabilities, canWriteChat } from "@/lib/server/capabilities";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { httpStatusFor } from "@/lib/server/http-errors";

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

  const postRef = adminDb().collection("posts").doc(id);
  const voteRef = adminDb().collection("pollVotes").doc(`${id}_${user.uid}`);

  try {
    const { counts, votedOption } = await adminDb().runTransaction(async (tx) => {
      const postSnap = await tx.get(postRef);
      if (!postSnap.exists) throw Object.assign(new Error("Post not found"), { code: 404 });
      const data = postSnap.data();
      if (data.kind !== "poll" || !Array.isArray(data.pollOptions) || option >= data.pollOptions.length) {
        throw Object.assign(new Error("Invalid poll option"), { code: 400 });
      }

      const existing = await tx.get(voteRef);
      if (existing.exists) {
        throw Object.assign(new Error("You already voted"), { code: 409 });
      }

      const counts = { ...(data.pollCounts || {}) };
      counts[option] = (counts[option] || 0) + 1;

      tx.set(voteRef, { postId: id, userId: user.uid, option, createdAt: new Date() });
      tx.update(postRef, {
        pollCounts: counts,
        pollTotal: (data.pollTotal || 0) + 1,
        lastActivityAt: new Date(),
      });

      return { counts, votedOption: option };
    });
    return NextResponse.json({ counts, votedOption });
  } catch (err) {
    const status = httpStatusFor(err);
    return NextResponse.json(
      { error: status === 409 ? "You already voted" : err.message || "Vote failed" },
      { status }
    );
  }
}
