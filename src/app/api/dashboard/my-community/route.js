import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { getPrisma } from "@/lib/db/prisma";
import { getCapabilities, canHost } from "@/lib/server/capabilities";
import { logError } from "@/lib/server/log";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const capabilities = await getCapabilities(auth.user.uid);
  if (!canHost(capabilities)) {
    return NextResponse.json({ error: "This overview is available to Moving In members." }, { status: 403 });
  }

  const prisma = getPrisma();
  if (!prisma) {
    return NextResponse.json({ groups: [], lounges: [], totals: { groups: 0, lounges: 0, liveAttendees: 0 } });
  }

  try {
    const uid = auth.user.uid;
    const [groups, lounges, groupTotal, loungeTotal] = await Promise.all([
      prisma.group.findMany({
        where: {
          createdBy: uid,
          status: { not: "deleted" },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          createdBy: true,
          parentGroupId: true,
          imageUrl: true,
          avatar: true,
          createdAt: true,
          _count: { select: { members: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.room.findMany({
        where: { createdBy: uid, status: { not: "deleted" } },
        select: {
          id: true,
          name: true,
          slug: true,
          kind: true,
          alwaysOn: true,
          opensAt: true,
          createdAt: true,
          status: true,
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.group.count({ where: { createdBy: uid, status: { not: "deleted" } } }),
      prisma.room.count({ where: { createdBy: uid, status: { not: "deleted" } } }),
    ]);

    const roomIds = lounges.map((room) => room.id);
    const recentPresence = roomIds.length
      ? await prisma.roomPresence.groupBy({
          by: ["roomId"],
          where: {
            roomId: { in: roomIds },
            leftAt: null,
            lastSeenAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
          },
          _count: { _all: true },
        })
      : [];
    const attendeeCounts = new Map(recentPresence.map((row) => [row.roomId, row._count._all]));

    const safeGroups = groups.map((group) => ({
      id: group.id,
      name: group.name,
      slug: group.slug,
      createdByMe: group.createdBy === uid,
      isSubgroup: !!group.parentGroupId,
      imageUrl: group.imageUrl || group.avatar || "",
      createdAt: group.createdAt,
      memberCount: group._count.members,
    }));
    const safeLounges = lounges.map((room) => ({
      id: room.id,
      name: room.name,
      slug: room.slug,
      kind: room.kind || "standard",
      opensAt: room.opensAt,
      createdAt: room.createdAt,
      liveAttendees: attendeeCounts.get(room.id) || 0,
      isLive: (attendeeCounts.get(room.id) || 0) > 0,
    }));

    return NextResponse.json({
      groups: safeGroups,
      lounges: safeLounges,
      totals: {
        groups: groupTotal,
        lounges: loungeTotal,
        liveAttendees: safeLounges.reduce((total, room) => total + room.liveAttendees, 0),
      },
    });
  } catch (error) {
    logError("dashboard.my_community_failed", { error: error.message });
    return NextResponse.json({ error: "Could not load your community overview." }, { status: 500 });
  }
}
