import { NextResponse } from "next/server";
import { listGroups, isGroupMember } from "@/lib/server/groups";
import { requireUser, requireHostUser, guardJson } from "@/lib/server/authorize";
import { logAudit } from "@/lib/server/audit";
import { serialize } from "@/lib/server/serialize";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function GET() {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;
  const groups = await listGroups();
  const withMembership = [];
  const prisma = getPrisma();
  for (const group of groups) {
    const membership = await isGroupMember(group.id, auth.user.uid);
    let memberCount = 0;
    try {
      memberCount = await prisma.groupMember.count({ where: { groupId: group.id } });
    } catch (err) {
      logError("groups.member_count_failed", { error: err.message, groupId: group.id });
    }
    withMembership.push({
      ...group,
      memberCount,
      joined: !!membership,
    });
  }
  return NextResponse.json({ groups: serialize(withMembership) });
}

export async function POST(req) {
  const auth = await requireHostUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { name, description = "" } = await req.json();
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Group name required" }, { status: 400 });
  }

  const slug = `${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)}-${Math.random().toString(36).slice(2, 6)}`;

  const prisma = getPrisma();
  try {
    const created = await prisma.group.create({
      data: {
        name,
        slug,
        description,
        status: "active",
        createdBy: auth.user.uid,
      },
    });
    await logAudit({
      actorId: auth.user.uid,
      actorName: auth.userDoc?.name || auth.user.email || "",
      action: "group.created",
      targetId: created.id,
      metadata: { name, slug },
    });
    return NextResponse.json({ id: created.id, slug });
  } catch (err) {
    logError("group.create_failed", { error: err.message });
    return NextResponse.json({ error: "Could not create group" }, { status: 500 });
  }
}
