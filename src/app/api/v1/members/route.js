import { getPrisma } from "@/lib/db/prisma";
import { requireApiToken } from "@/lib/server/api-auth";
import { apiJson, apiPreflight } from "@/lib/server/api-http";
import {
  clampLimit,
  clampOffset,
  isMemberVisible,
  matchesMemberQuery,
  publicMember,
} from "@/lib/server/api-v1-core";
import { BLOCKED_KEY, idsFromExtra } from "@/lib/server/member-safety-core";
import { logError } from "@/lib/server/log";

export const dynamic = "force-dynamic";

const SCAN_CAP = 2000;

export function OPTIONS() {
  return apiPreflight();
}

export async function GET(req) {
  const { auth, response } = await requireApiToken(req, "read:members");
  if (response) return response;

  const prisma = getPrisma();
  if (!prisma) return apiJson({ error: "Service unavailable" }, { status: 503 });

  const url = new URL(req.url);
  const limit = clampLimit(url.searchParams.get("limit"));
  const offset = clampOffset(url.searchParams.get("offset"));
  const q = url.searchParams.get("q") || "";

  try {
    const [viewer, rows] = await Promise.all([
      prisma.user.findUnique({
        where: { id: auth.userId },
        select: { role: true, extra: true },
      }),
      prisma.user.findMany({
        where: { suspended: { not: true } },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: SCAN_CAP,
        select: {
          id: true,
          name: true,
          username: true,
          headline: true,
          bio: true,
          location: true,
          country: true,
          photoURL: true,
          role: true,
          crafts: true,
          hobbies: true,
          skillLevel: true,
          yearsExperience: true,
          favoriteYarnBrand: true,
          goToYarn: true,
          createdAt: true,
          extra: true,
        },
      }),
    ]);

    const canModerate = ["owner", "moderator"].includes(viewer?.role);
    const blockedIds = idsFromExtra(viewer?.extra, BLOCKED_KEY);

    const visible = rows.filter(
      (row) =>
        isMemberVisible(row, { viewerId: auth.userId, canModerate, blockedIds }) &&
        matchesMemberQuery(row, q)
    );

    const page = visible.slice(offset, offset + limit);
    return apiJson({
      data: page.map(publicMember),
      pagination: {
        limit,
        offset,
        total: visible.length,
        hasMore: offset + limit < visible.length,
      },
    });
  } catch (err) {
    logError("api_v1.members_failed", { userId: auth.userId, error: err.message });
    return apiJson({ error: "Internal error" }, { status: 500 });
  }
}
