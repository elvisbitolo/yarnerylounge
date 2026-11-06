import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Engagement progress is unavailable" }, { status: 503 });

  try {
    const [profile, post, comment, rsvp, loungeVisit, circle] = await Promise.all([
      prisma.user.findUnique({
        where: { id: user.uid },
        select: { photoURL: true, username: true },
      }),
      prisma.post.findFirst({
        where: { authorId: user.uid, deletedAt: null, archivedAt: null },
        select: { id: true },
      }),
      prisma.postComment.findFirst({
        where: { authorId: user.uid },
        select: { id: true },
      }),
      prisma.rsvp.findFirst({
        where: { userId: user.uid },
        select: { id: true },
      }),
      prisma.roomPresence.findFirst({
        where: { userId: user.uid },
        select: { id: true },
      }),
      prisma.group.findFirst({
        where: { createdBy: user.uid, status: "active" },
        select: { id: true },
      }),
    ]);

    const steps = [
      { id: "profile", label: "Complete your profile", detail: "Add a profile photo and choose your username.", href: "/account/profile#profile", done: Boolean(profile?.photoURL && profile?.username) },
      { id: "post", label: "Share your first post", detail: "Let the community know what you’re working on.", href: "/feed", done: Boolean(post) },
      { id: "comment", label: "Join a conversation", detail: "Leave a comment on a community discussion.", href: "/feed", done: Boolean(comment) },
      { id: "lounge", label: "Visit a live lounge", detail: "Drop into a lounge and meet members in real time.", href: "/rooms", done: Boolean(loungeVisit) },
      { id: "event", label: "Join a community event", detail: "RSVP to an event that interests you.", href: "/events", done: Boolean(rsvp) },
      { id: "circle", label: "Create a crochet circle", detail: "Bring members together around something you love.", href: "/groups/create", done: Boolean(circle) },
    ];
    const completed = steps.filter((step) => step.done).length;

    return NextResponse.json({
      completed,
      total: steps.length,
      percentage: Math.round((completed / steps.length) * 100),
      steps,
    });
  } catch (err) {
    logError("dashboard.engagement_progress_failed", { error: err.message, uid: user.uid });
    return NextResponse.json({ error: "Could not load engagement progress" }, { status: 503 });
  }
}
