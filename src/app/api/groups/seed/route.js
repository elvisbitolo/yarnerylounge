import { NextResponse } from "next/server";
import { requireOwner, guardJson } from "@/lib/server/authorize";
import { seedCommunityGroups, COMMUNITY_GROUPS } from "@/lib/server/community-groups";
import { ensureTopicsForAllGroups } from "@/lib/server/group-topics";

export async function GET() {
  const auth = await requireOwner();
  const denied = guardJson(auth);
  if (denied) return denied;

  const results = await seedCommunityGroups(auth.user.uid);
  const topics = await ensureTopicsForAllGroups();

  return NextResponse.json({
    ok: true,
    total: COMMUNITY_GROUPS.length,
    groups: results,
    topics: topics.length,
  });
}