import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export const dynamic = "force-dynamic";

// Autosuggest for the "#" trigger in the composer: ranks tags by how many posts
// carry them, limited to the most recent rows so stale fads don't dominate.
const SUGGEST_SCAN = 600;

export async function GET(req) {
  const q = (new URL(req.url).searchParams.get("q") || "").slice(0, 40).toLowerCase();
  try {
    const prisma = getPrisma();
    const rows = await prisma.post.findMany({
      where: { deletedAt: null, archivedAt: null, scheduledAt: null, hidden: false },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: SUGGEST_SCAN,
      select: { hashtags: true },
    });
    const tally = new Map();
    for (const row of rows) {
      for (const tag of row.hashtags || []) {
        if (!q || tag.toLowerCase().includes(q)) {
          tally.set(tag, (tally.get(tag) || 0) + 1);
        }
      }
    }
    const tags = [...tally.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => {
        if (a.count !== b.count) return b.count - a.count;
        return a.tag.localeCompare(b.tag);
      })
      .slice(0, 8);
    return NextResponse.json({ tags });
  } catch (err) {
    logError("hashtags.suggest_failed", { error: err.message });
    return NextResponse.json({ tags: [] });
  }
}