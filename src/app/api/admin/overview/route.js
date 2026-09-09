import { NextResponse } from "next/server";
import { requireOwner, guardJson } from "@/lib/server/authorize";
import { getLeaderboard } from "@/lib/server/gamification";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function GET() {
  const auth = await requireOwner();
  const denied = guardJson(auth);
  if (denied) return denied;

  const prisma = getPrisma();
  try {
    const [users, posts, groups, spaces, rooms, events, courses, rsvps, notifications, reports] =
      await Promise.all([
        prisma.user.count(),
        prisma.post.count(),
        prisma.group.count(),
        prisma.space.count(),
        prisma.room.count(),
        prisma.event.count(),
        prisma.course.count(),
        prisma.rsvp.count(),
        prisma.notification.count(),
        prisma.report.count(),
      ]);

    const recentPostsRows = await prisma.post.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, authorName: true, text: true, createdAt: true },
    });
    const recentPosts = recentPostsRows.map((p) => ({
      id: p.id,
      authorName: p.authorName || "",
      text: (p.text || "").slice(0, 140),
      createdAt: p.createdAt ? p.createdAt.getTime() : 0,
    }));

    const leaderboard = await getLeaderboard(5);

    return NextResponse.json({
      counts: {
        users,
        posts,
        groups,
        spaces,
        rooms,
        events,
        courses,
        rsvps,
        notifications,
        reports,
      },
      recentPosts,
      leaderboard,
    });
  } catch (err) {
    logError("admin.overview.prisma_failed", { error: err.message });
    return NextResponse.json({ error: "Could not load overview" }, { status: 500 });
  }
}