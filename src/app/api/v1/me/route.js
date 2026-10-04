import { getPrisma } from "@/lib/db/prisma";
import { requireApiToken } from "@/lib/server/api-auth";
import { apiJson, apiPreflight } from "@/lib/server/api-http";
import { publicMember } from "@/lib/server/api-v1-core";
import { logError } from "@/lib/server/log";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return apiPreflight();
}

export async function GET(req) {
  const { auth, response } = await requireApiToken(req, "read:profile");
  if (response) return response;

  const prisma = getPrisma();
  if (!prisma) return apiJson({ error: "Service unavailable" }, { status: 503 });

  try {
    const row = await prisma.user.findUnique({ where: { id: auth.userId } });
    if (!row) return apiJson({ error: "Not found" }, { status: 404 });
    return apiJson({ data: publicMember(row) });
  } catch (err) {
    logError("api_v1.me_failed", { userId: auth.userId, error: err.message });
    return apiJson({ error: "Internal error" }, { status: 500 });
  }
}
