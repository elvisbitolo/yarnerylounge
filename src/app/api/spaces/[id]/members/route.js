import { NextResponse } from "next/server";
import { requireOwner, guardJson } from "@/lib/server/authorize";
import { getSpace, addSpaceMember, getSpaceMembers } from "@/lib/server/spaces";
import { syncSpaceChatParticipants } from "@/lib/server/chat";
import { logAudit } from "@/lib/server/audit";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function POST(req, { params }) {
  const { id: spaceId } = await params;
  const auth = await requireOwner();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { userId } = await req.json();
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "Member required" }, { status: 400 });
  }

  const space = await getSpace(spaceId);
  if (!space) {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  const prisma = getPrisma();
  let userName = "Member";
  try {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    if (row) {
      userName = row.name || "Member";
    } else {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
  } catch (err) {
    logError("space.members.prisma_user_read_failed", { error: err.message });
  }

  const added = await addSpaceMember(spaceId, userId, userName);

  let memberIds = [];
  try {
    const rows = await prisma.spaceMember.findMany({
      where: { spaceId },
      select: { userId: true },
    });
    memberIds = rows.map((r) => r.userId);
  } catch (err) {
    logError("space.members.prisma_list_failed", { error: err.message });
  }
  await syncSpaceChatParticipants(spaceId, memberIds);

  await logAudit({
    actorId: auth.user.uid,
    actorName: auth.userDoc?.name || auth.user.email || "",
    action: "space.member.added",
    targetId: spaceId,
    metadata: { space: space.name, userId },
  });

  return NextResponse.json({ added });
}

export async function DELETE(req, { params }) {
  const { id: spaceId } = await params;
  const auth = await requireOwner();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Member required" }, { status: 400 });
  }

  const space = await getSpace(spaceId);
  if (!space) {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  const prisma = getPrisma();
  try {
    await prisma.spaceMember.deleteMany({
      where: { id: `${spaceId}_${userId}` },
    });
    const rows = await prisma.spaceMember.findMany({
      where: { spaceId },
      select: { userId: true },
    });
    await syncSpaceChatParticipants(
      spaceId,
      rows.map((r) => r.userId)
    );
    await logAudit({
      actorId: auth.user.uid,
      actorName: auth.userDoc?.name || auth.user.email || "",
      action: "space.member.removed",
      targetId: spaceId,
      metadata: { space: space.name, userId },
    });
    return NextResponse.json({ removed: true });
  } catch (err) {
    logError("space.members.prisma_remove_failed", { error: err.message });
    return NextResponse.json({ error: "Could not remove member" }, { status: 500 });
  }
}
