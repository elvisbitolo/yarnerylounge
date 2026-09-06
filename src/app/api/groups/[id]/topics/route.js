import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { listGroupTopics } from "@/lib/server/group-topics";

export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const { id: groupId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const topics = await listGroupTopics(groupId);
  return NextResponse.json({ topics });
}