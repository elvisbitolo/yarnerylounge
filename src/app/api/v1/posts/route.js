import { getPrisma } from "@/lib/db/prisma";
import { requireApiToken } from "@/lib/server/api-auth";
import { apiJson, apiPreflight } from "@/lib/server/api-http";
import { clampLimit, clampOffset, publicPost } from "@/lib/server/api-v1-core";
import { logError } from "@/lib/server/log";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return apiPreflight();
}

// Posts the token owner is entitled to: the public community feed (no space or
// group scope) plus their own posts. Space/group-only posts stay out of reach of
// a token that could end up on a public website.
function visibleWhere(userId) {
  return {
    OR: [
      { AND: [{ spaceId: null }, { groupId: null }] },
      { authorId: userId },
    ],
  };
}

export async function GET(req) {
  const { auth, response } = await requireApiToken(req, "read:posts");
  if (response) return response;

  const prisma = getPrisma();
  if (!prisma) return apiJson({ error: "Service unavailable" }, { status: 503 });

  const url = new URL(req.url);
  const limit = clampLimit(url.searchParams.get("limit"));
  const offset = clampOffset(url.searchParams.get("offset"));
  const where = visibleWhere(auth.userId);

  try {
    const [total, rows] = await Promise.all([
      prisma.post.count({ where }),
      prisma.post.findMany({
        where,
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        skip: offset,
        take: limit,
      }),
    ]);

    return apiJson({
      data: rows.map(publicPost),
      pagination: { limit, offset, total, hasMore: offset + rows.length < total },
    });
  } catch (err) {
    logError("api_v1.posts_failed", { userId: auth.userId, error: err.message });
    return apiJson({ error: "Internal error" }, { status: 500 });
  }
}
