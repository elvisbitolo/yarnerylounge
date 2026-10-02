// Permanent cleanup of trashed recordings.
//
// Deleting only soft-deletes, so something has to actually free the bytes after
// the 30-day recovery window. Daily is plenty: the exact purge moment is not
// user-visible, only the window is.

import { NextResponse } from "next/server";
import { purgeExpiredRecordings, TRASH_RETENTION_DAYS } from "@/lib/server/recordings";
import { logError } from "@/lib/server/log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { purged } = await purgeExpiredRecordings();
    return NextResponse.json({
      ok: true,
      purged,
      retentionDays: TRASH_RETENTION_DAYS,
    });
  } catch (error) {
    logError("recordings.purge.failed", { message: error?.message });
    return NextResponse.json({ error: error?.message || "Purge failed" }, { status: 500 });
  }
}
