import { NextResponse } from "next/server";
import { listGroups, isGroupMember } from "@/lib/server/groups";
import { requireUser, requireHostUser, guardJson } from "@/lib/server/authorize";
import { logAudit } from "@/lib/server/audit";
import { serialize } from "@/lib/server/serialize";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { getCapabilities, canBuildNeighborhoods } from "@/lib/server/capabilities";

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
  const capabilities = await getCapabilities(auth.user.uid);
  return NextResponse.json({
    groups: serialize(withMembership),
    uid: auth.user.uid,
    canCreate: canBuildNeighborhoods(capabilities),
  });
}

export async function POST(req) {
  const auth = await requireHostUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  const parentGroupId = typeof body.parentGroupId === "string" ? body.parentGroupId.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Circle name required" }, { status: 400 });
  }
  if (name.length > 80 || description.length > 1200) {
    return NextResponse.json({ error: "Keep the name under 80 characters and description under 1,200 characters." }, { status: 400 });
  }
  if (imageUrl && imageUrl.length > 2000) {
    return NextResponse.json({ error: "Circle photo URL is too long." }, { status: 400 });
  }
  if (imageUrl && !/^https:\/\//i.test(imageUrl) && !/^data:image\/(png|jpeg|webp|gif|avif);base64,/i.test(imageUrl)) {
    return NextResponse.json({ error: "Circle photo must be uploaded as an image." }, { status: 400 });
  }

  const slug = `${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)}-${Math.random().toString(36).slice(2, 6)}`;

  const prisma = getPrisma();
  try {
    let parent = null;
    if (parentGroupId) {
      parent = await prisma.group.findUnique({
        where: { id: parentGroupId },
        select: { id: true, name: true, createdBy: true, parentGroupId: true, status: true },
      });
      if (!parent || parent.status !== "active" || parent.parentGroupId) {
        return NextResponse.json({ error: "Choose an active main crochet circle. Subgroups can only be one level deep." }, { status: 400 });
      }
      if (parent.createdBy !== auth.user.uid && auth.userDoc?.role !== "owner") {
        const membership = await prisma.groupMember.findUnique({
          where: { id: `${parentGroupId}_${auth.user.uid}` },
          select: { id: true },
        });
        if (!membership) {
          return NextResponse.json({ error: "Join this crochet circle before launching a subgroup inside it." }, { status: 403 });
        }
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: {
          name,
          slug,
          description,
          imageUrl: imageUrl || null,
          status: "active",
          createdBy: auth.user.uid,
          parentGroupId: parentGroupId || null,
        },
      });
      const creatorName = auth.userDoc?.name || auth.user.email || "Member";
      await tx.groupMember.create({
        data: {
          id: `${group.id}_${auth.user.uid}`,
          groupId: group.id,
          userId: auth.user.uid,
          name: creatorName,
          role: "creator",
        },
      });
      return group;
    });
    await logAudit({
      actorId: auth.user.uid,
      actorName: auth.userDoc?.name || auth.user.email || "",
      action: parentGroupId ? "group.subgroup_created" : "group.created",
      targetId: created.id,
      metadata: { name, slug, parentGroupId, parentGroupName: parent?.name || "" },
    });
    return NextResponse.json({ id: created.id, slug, parentGroupId: parentGroupId || null });
  } catch (err) {
    logError("group.create_failed", { error: err.message });
    return NextResponse.json({ error: "Could not create group" }, { status: 500 });
  }
}
