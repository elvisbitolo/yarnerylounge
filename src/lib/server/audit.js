import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function logAudit({ actorId, actorName, action, targetId, metadata = {} }) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      await prisma.auditLog.create({
        data: {
          actorId: actorId || "",
          actorName: actorName || "",
          action,
          targetId: targetId || "",
          metadata,
          createdAt: new Date(),
        },
      });
    } catch (err) {
      logError("audit.prisma_create_failed", { error: err.message });
    }
  }
}
