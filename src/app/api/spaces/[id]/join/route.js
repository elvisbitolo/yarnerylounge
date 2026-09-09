import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getAccessSub, isActiveSub } from "@/lib/server/subscription";
import { getCapabilities, canJoinNeighborhoods } from "@/lib/server/capabilities";
import {
  getSpace,
  isSpaceMember,
  addSpaceMember,
  removeSpaceMember,
} from "@/lib/server/spaces";
import { syncSpaceChatParticipants } from "@/lib/server/chat";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

async function spaceMemberIds(spaceId) {
  try {
    const rows = await getPrisma().spaceMember.findMany({
      where: { spaceId },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  } catch (err) {
    logError("space.join.members_read_failed", { error: err.message, spaceId });
    return [];
  }
}

export async function POST(req, { params }) {
  const { id: spaceId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const sub = await getAccessSub(user.uid);
  if (!isActiveSub(sub)) {
    return NextResponse.json({ error: "Active membership required" }, { status: 403 });
  }
  const caps = await getCapabilities(user.uid);
  const canJoin = canJoinNeighborhoods(caps);
  if (!canJoin) {
    return NextResponse.json(
      { error: "Neighborhoods are for premium members" },
      { status: 403 }
    );
  }
  const limited = rateLimitGuard(`space-join:${user.uid}`, { limit: 20 });
  if (limited) return limited;

  const space = await getSpace(spaceId);
  if (!space || space.status !== "active") {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  const userDoc = await getUserDoc(user.uid);
  const isOwner = userDoc?.role === "owner";
  const membership = await isSpaceMember(spaceId, user.uid);
  const joined = !!membership;

  if (joined) {
    await removeSpaceMember(spaceId, user.uid);
    if (!isOwner) {
      await syncSpaceChatParticipants(spaceId, await spaceMemberIds(spaceId));
    }
    return NextResponse.json({ joined: false });
  }

  if (!isOwner) {
    if (space.access === "invite") {
      return NextResponse.json({ error: "This space is invite only" }, { status: 403 });
    }
  }

  await addSpaceMember(spaceId, user.uid, userDoc?.name || user.name || user.email?.split("@")[0] || "Member");
  await syncSpaceChatParticipants(spaceId, await spaceMemberIds(spaceId));

  return NextResponse.json({ joined: true });
}
