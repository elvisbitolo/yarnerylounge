import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { getPrisma } from "@/lib/db/prisma";

export async function GET() {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const prisma = getPrisma();
  const rows = await prisma.post.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { hashtags: true },
  });

  const tagCounts = {};
  rows.forEach((post) => {
    const tags = post.hashtags || [];
    tags.forEach((tag) => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });

  const topics = Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);

  return NextResponse.json({ topics });
}