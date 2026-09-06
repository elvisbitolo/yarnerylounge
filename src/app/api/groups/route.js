import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { listGroups, isGroupMember } from "@/lib/server/groups";
import { requireUser, requireHostUser, guardJson } from "@/lib/server/authorize";
import { logAudit } from "@/lib/server/audit";
import { serialize } from "@/lib/server/serialize";

export async function GET() {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;
  const groups = await listGroups();
  const withMembership = [];
  for (const group of groups) {
    const membership = await isGroupMember(group.id, auth.user.uid);
    const membersSnap = await adminDb()
      .collection("groupMembers")
      .where("groupId", "==", group.id)
      .get();
    withMembership.push({
      ...group,
      memberCount: membersSnap.size,
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

  const ref = await adminDb().collection("groups").add({
    name,
    slug,
    description,
    status: "active",
    createdBy: auth.user.uid,
    createdAt: new Date(),
  });

  await logAudit({
    actorId: auth.user.uid,
    actorName: auth.userDoc?.name || auth.user.email || "",
    action: "group.created",
    targetId: ref.id,
    metadata: { name, slug },
  });

  return NextResponse.json({ id: ref.id, slug });
}
