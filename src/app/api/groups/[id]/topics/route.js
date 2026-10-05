import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { getCapabilities, canBuildNeighborhoods } from "@/lib/server/capabilities";
import { getScopedHostRights } from "@/lib/server/hosts";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getPrisma } from "@/lib/db/prisma";
import { listGroupTopics, createGroupTopic, deleteGroupTopic } from "@/lib/server/group-topics";

export const dynamic = "force-dynamic";

// Sub-groups ("topics") inside a Neighbourhood Group.
//
// GET is open to any signed-in member, as browsing a group is.
//
// POST/DELETE are the "Neighbourhood Builder" perk on the Moving In tier: "launch
// independent circles and sub-groups". Two conditions, both required:
//   1. the Moving In tier (canBuildNeighborhoods), and
//   2. authority over this particular group - its creator or a scoped host, or
//      staff.
// The tier check alone is not enough: otherwise any paying member could create
// sub-groups inside somebody else's group and reshuffle their neighbourhood.

export async function GET(_req, { params }) {
  const { id: groupId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const topics = await listGroupTopics(groupId);
  return NextResponse.json({ topics });
}

async function authorizeBuilder(groupId, auth) {
  const [caps, rights] = await Promise.all([
    getCapabilities(auth.user.uid),
    getScopedHostRights(auth.user.uid, "group", groupId),
  ]);
  if (!canBuildNeighborhoods(caps)) {
    return { error: "Launching sub-groups requires a Moving In membership", status: 403 };
  }
  if (!rights.isStaff && !rights.isHost && !rights.isCoHost) {
    return { error: "Only the group's host can change its sub-groups", status: 403 };
  }
  return { ok: true };
}

export async function POST(req, { params }) {
  const { id: groupId } = await params;
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`group-topic-create:${auth.user.uid}`, { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const prisma = getPrisma();
  if (!prisma) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
  let group = null;
  try {
    group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, status: true },
    });
  } catch {
    group = null;
  }
  if (!group || group.status !== "active") {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const authz = await authorizeBuilder(groupId, auth);
  if (authz.error) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }

  const body = await req.json().catch(() => ({}));
  const result = await createGroupTopic(groupId, {
    name: body?.name,
    description: body?.description,
    emoji: body?.emoji,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ topic: result.topic }, { status: 201 });
}

export async function DELETE(req, { params }) {
  const { id: groupId } = await params;
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`group-topic-delete:${auth.user.uid}`, { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const url = new URL(req.url);
  const topicKey = url.searchParams.get("key") || "";
  if (!topicKey) {
    return NextResponse.json({ error: "Which sub-group?" }, { status: 400 });
  }

  const authz = await authorizeBuilder(groupId, auth);
  if (authz.error) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }

  const result = await deleteGroupTopic(groupId, topicKey);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}