import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getAccessSub, isActiveSub } from "@/lib/server/subscription";
import { syncGroupChatParticipants } from "@/lib/server/chat";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function POST(req, { params }) {
  const { id: groupId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const sub = await getAccessSub(user.uid);
  if (!isActiveSub(sub)) {
    return NextResponse.json({ error: "Active membership required" }, { status: 403 });
  }

  const prisma = getPrisma();
  let groupOk = false;
  try {
    const row = await prisma.group.findUnique({
      where: { id: groupId },
      select: { status: true },
    });
    groupOk = !!(row && row.status === "active");
  } catch (err) {
    logError("group.join.prisma_group_read_failed", { error: err.message });
  }
  if (!groupOk) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const userDoc = await getUserDoc(user.uid);
  const memberId = `${groupId}_${user.uid}`;
  const name = userDoc?.name || user.name || user.email?.split("@")[0] || "Member";

  try {
    const existing = await prisma.groupMember.findUnique({ where: { id: memberId } });
    const joined = !!existing;

    if (joined) {
      await prisma.groupMember.deleteMany({ where: { id: memberId } });
    } else {
      await prisma.groupMember.create({
        data: {
          id: memberId,
          groupId,
          userId: user.uid,
          name,
          role: "member",
        },
      });
    }
    const rows = await prisma.groupMember.findMany({
      where: { groupId },
      select: { userId: true },
    });
    await syncGroupChatParticipants(
      groupId,
      rows.map((r) => r.userId)
    );
    return NextResponse.json({ joined: !joined });
  } catch (err) {
    logError("group.join.prisma_failed", { error: err.message });
    return NextResponse.json({ error: "Could not update membership" }, { status: 500 });
  }
}
