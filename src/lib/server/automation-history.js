import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function recordAutomationRun({ automationId, trigger, action, targetUserId, success, error }) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const created = await prisma.automationHistory.create({
        data: {
          automationId,
          trigger: trigger || "",
          action: action || "",
          targetUserId: targetUserId || "",
          success: !!success,
          error: error || "",
          ranAt: new Date(),
        },
      });
      return { id: created.id };
    } catch (err) {
      logError("automationHistory.prisma_record_failed", { error: err.message });
    }
  }
  return { id: "" };
}

export async function listAutomationRuns(automationId, limit = 25) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.automationHistory.findMany({
        where: { automationId },
        orderBy: { ranAt: "desc" },
        take: safeLimit,
      });
      return rows.map((row) => ({
        id: row.id,
        automationId: row.automationId,
        trigger: row.trigger || "",
        action: row.action || "",
        targetUserId: row.targetUserId || "",
        success: !!row.success,
        error: row.error || "",
        ranAt: row.ranAt ? new Date(row.ranAt).getTime() : 0,
      }));
    } catch (err) {
      logError("automationHistory.prisma_list_failed", { error: err.message });
    }
  }
  return [];
}

export async function getAutomationStats(automationId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.automationHistory.findMany({
        where: { automationId },
        select: { success: true, ranAt: true },
      });
      let total = 0;
      let success = 0;
      let failed = 0;
      let lastRun = 0;
      for (const row of rows) {
        total += 1;
        if (row.success) success += 1;
        else failed += 1;
        const ms = row.ranAt ? new Date(row.ranAt).getTime() : 0;
        if (ms > lastRun) lastRun = ms;
      }
      return { total, success, failed, lastRun };
    } catch (err) {
      logError("automationHistory.prisma_stats_failed", { error: err.message });
    }
  }
  return { total: 0, success: 0, failed: 0, lastRun: 0 };
}
