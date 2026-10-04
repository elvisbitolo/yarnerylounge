import { getPrisma } from "@/lib/db/prisma";
import { requireApiToken } from "@/lib/server/api-auth";
import { apiJson, apiPreflight } from "@/lib/server/api-http";
import { clampLimit, clampOffset, publicEvent } from "@/lib/server/api-v1-core";
import { logError } from "@/lib/server/log";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return apiPreflight();
}

export async function GET(req) {
  const { auth, response } = await requireApiToken(req, "read:events");
  if (response) return response;

  const prisma = getPrisma();
  if (!prisma) return apiJson({ error: "Service unavailable" }, { status: 503 });

  const url = new URL(req.url);
  const limit = clampLimit(url.searchParams.get("limit"));
  const offset = clampOffset(url.searchParams.get("offset"));
  const upcoming = url.searchParams.get("upcoming") !== "0";

  // Only public, community-wide events cross the API boundary. Space events and
  // members-only events stay in the app regardless of the token holder's role.
  const where = { spaceId: null, membersOnly: false };
  if (upcoming) where.startTime = { gte: new Date() };

  try {
    const [total, rows] = await Promise.all([
      prisma.event.count({ where }),
      prisma.event.findMany({
        where,
        orderBy: { startTime: upcoming ? "asc" : "desc" },
        skip: offset,
        take: limit,
        include: { creator: { select: { id: true, name: true } } },
      }),
    ]);

    return apiJson({
      data: rows.map((row) => publicEvent(row, row.creator?.name)),
      pagination: { limit, offset, total, hasMore: offset + rows.length < total },
    });
  } catch (err) {
    logError("api_v1.events_failed", { userId: auth.userId, error: err.message });
    return apiJson({ error: "Internal error" }, { status: 500 });
  }
}
