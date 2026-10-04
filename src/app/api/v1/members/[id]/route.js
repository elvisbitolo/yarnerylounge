import { getPrisma } from "@/lib/db/prisma";
import { requireApiToken } from "@/lib/server/api-auth";
import { apiJson, apiPreflight } from "@/lib/server/api-http";
import { isMemberVisible, publicMember } from "@/lib/server/api-v1-core";
import { BLOCKED_KEY, idsFromExtra } from "@/lib/server/member-safety-core";
import { logError } from "@/lib/server/log";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return apiPreflight();
}

export async function GET(req, { params }) {
  const { auth, response } = await requireApiToken(req, "read:members");
  if (response) return response;

  const prisma = getPrisma();
  if (!prisma) return apiJson({ error: "Service unavailable" }, { status: 503 });

  const { id } = await params;
  if (!id) return apiJson({ error: "Not found" }, { status: 404 });

  try {
    const [viewer, row] = await Promise.all([
      prisma.user.findUnique({
        where: { id: auth.userId },
        select: { role: true, extra: true },
      }),
      prisma.user.findUnique({ where: { id } }),
    ]);

    const canModerate = ["owner", "moderator"].includes(viewer?.role);
    const blockedIds = idsFromExtra(viewer?.extra, BLOCKED_KEY);

    if (!row || row.suspended || !isMemberVisible(row, { viewerId: auth.userId, canModerate, blockedIds })) {
      return apiJson({ error: "Not found" }, { status: 404 });
    }

    return apiJson({ data: publicMember(row) });
  } catch (err) {
    logError("api_v1.member_failed", { userId: auth.userId, id, error: err.message });
    return apiJson({ error: "Internal error" }, { status: 500 });
  }
}
