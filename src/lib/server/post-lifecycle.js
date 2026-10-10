import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { TRASH_RETENTION_MS } from "@/lib/server/posts-core";

// Post lifecycle maintenance that would otherwise need a cron job:
//
//  1. publishDuePosts — materialises scheduled posts the moment their time
//     arrives, so scheduling works with no background worker. Called from the
//     feed read path (throttled), which is the only place the posts matter.
//  2. purgeExpiredTrash — hard-deletes posts that have sat in trash longer
//     than TRASH_RETENTION_MS, matching Facebook's 30-day window.
//
// Both are throttled by lastMaintenanceAt so a busy feed doesn't run them on
// every request. The clock is module-level, which is per-instance: on
// serverless that means at most one extra run per cold container, harmless.
let lastMaintenanceAt = 0;
const MAINTENANCE_INTERVAL_MS = 60_000;

export async function publishDuePosts(prisma = getPrisma()) {
  if (!prisma) return 0;
  const now = new Date();
  const res = await prisma.post.updateMany({
    where: { scheduledAt: { lte: now } },
    // createdAt is re-stamped at publish time so the post enters the feed as
    // new content instead of slotting in behind everything written while it
    // waited.
    data: { scheduledAt: null, createdAt: now },
  });
  return res?.count || 0;
}

export async function purgeExpiredTrash(prisma = getPrisma()) {
  if (!prisma) return 0;
  const cutoff = new Date(Date.now() - TRASH_RETENTION_MS);
  const res = await prisma.post.deleteMany({
    where: { deletedAt: { lt: cutoff } },
  });
  return res?.count || 0;
}

export async function runPostMaintenance(prisma = getPrisma(), now = Date.now()) {
  if (!prisma) return { published: 0, purged: 0 };
  if (now - lastMaintenanceAt < MAINTENANCE_INTERVAL_MS) {
    return { published: 0, purged: 0, skipped: true };
  }
  lastMaintenanceAt = now;
  try {
    const [published, purged] = await Promise.all([
      publishDuePosts(prisma),
      purgeExpiredTrash(prisma),
    ]);
    if (published || purged) {
      logError("posts.maintenance", { published, purged, level: "info" });
    }
    return { published, purged };
  } catch (err) {
    logError("posts.maintenance_failed", { error: err.message });
    return { published: 0, purged: 0, error: err.message };
  }
}

// Test seam: lets a unit test run maintenance twice without hitting the
// throttle.
export function resetMaintenanceClock() {
  lastMaintenanceAt = 0;
}
