import { NextResponse } from "next/server";
import {
  listSpaces,
  isSpaceMember,
  createSpace,
  SPACE_ACCESS,
} from "@/lib/server/spaces";
import { requireUser, requireOwner, guardJson } from "@/lib/server/authorize";
import { logAudit } from "@/lib/server/audit";
import { clean } from "@/lib/server/validate";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function GET(req) {
  const isAdmin = new URL(req.url).searchParams.get("admin") === "1";
  const auth = isAdmin ? await requireOwner() : await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const spaces = await listSpaces();
  const withMembership = [];
  const prisma = getPrisma();
  for (const space of spaces) {
    const membership = await isSpaceMember(space.id, auth.user.uid);
    if (space.access === "invite" && !membership && !isAdmin) continue;
    let memberCount = 0;
    try {
      memberCount = await prisma.spaceMember.count({ where: { spaceId: space.id } });
    } catch (err) {
      logError("spaces.member_count_failed", { error: err.message, spaceId: space.id });
    }
    withMembership.push({
      id: space.id,
      name: space.name,
      slug: space.slug,
      description: space.description || "",
      access: space.access,
      requiredTier: space.requiredTier || "",
      purchasePriceCents: space.purchasePriceCents || 0,
      features: space.features || {},
      publicPreview: !!space.publicPreview,
      memberCount,
      joined: !!membership,
    });
  }
  return NextResponse.json({ spaces: withMembership });
}

export async function POST(req) {
  const auth = await requireOwner();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { name, description = "", features = {}, access = "public", requiredTier = "", purchasePriceCents = 0, publicPreview = false } = await req.json();
  const spaceName = clean(name, 80);
  const spaceDesc = clean(description, 10000);
  if (!spaceName) {
    return NextResponse.json({ error: "Space name required" }, { status: 400 });
  }
  if (!SPACE_ACCESS.includes(access)) {
    return NextResponse.json({ error: "Invalid access type" }, { status: 400 });
  }
  const price = Number(purchasePriceCents) || 0;
  if (price < 0 || price > 1000000) {
    return NextResponse.json({ error: "Invalid price" }, { status: 400 });
  }

  const space = await createSpace({
    name: spaceName,
    description: spaceDesc,
    features,
    access,
    requiredTier,
    purchasePriceCents: price,
    publicPreview,
    createdBy: auth.user.uid,
  });

  await logAudit({
    actorId: auth.user.uid,
    actorName: auth.userDoc?.name || auth.user.email || "",
    action: "space.created",
    targetId: space.id,
    metadata: { name: space.name, slug: space.slug, access },
  });

  return NextResponse.json(space);
}
