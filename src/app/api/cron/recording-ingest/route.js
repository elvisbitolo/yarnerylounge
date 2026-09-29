// Retries recording pulls that did not complete inside the webhook request.
//
// JaaS deletes a recording 24 hours after the meeting, so any pull that failed
// (cold start, transient network, Vercel timeout) has to be retried before that
// window closes — after it, the recording is gone for good. This sweep walks
// rows that still have a live `sourceLink` and retries them.
//
// This is the safety net, not the primary path: /api/webhooks/jitsi already
// pulls via after(). Run it often enough to leave real margin inside 24h.

import { NextResponse } from "next/server";
import { pullRecording } from "@/lib/server/recordings";
import { isSourceExpired } from "@/lib/server/recordings-core";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// One file per request is plenty: a single 90-minute recording can take a
// while, and a small batch keeps the function inside its duration budget.
const BATCH_SIZE = 3;

export async function GET(req) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrisma();
  const now = new Date();

  // Anything still holding a live source link is worth another attempt.
  // "processing" is included because a previous run may have been killed
  // mid-download, which would otherwise strand the row forever.
  const candidates = await prisma.recording.findMany({
    where: {
      sourceLink: { not: null },
      sourceExpiresAt: { gt: now },
      status: { in: ["pending", "failed", "processing"] },
    },
    orderBy: { sourceExpiresAt: "asc" },
    take: BATCH_SIZE,
  });

  let pulled = 0;
  let skipped = 0;
  const errors = [];

  for (const recording of candidates) {
    if (isSourceExpired(recording.sourceExpiresAt)) {
      skipped += 1;
      continue;
    }
    const result = await pullRecording(recording);
    if (result.ok) pulled += 1;
    else if (result.skipped) skipped += 1;
    else errors.push({ id: recording.id, error: result.error });
  }

  // Anything past its deadline can never be fetched. Mark it so the library
  // does not show a permanently "pending" card, and so it stops being scanned.
  const { count: expired } = await prisma.recording.updateMany({
    where: { sourceLink: { not: null }, sourceExpiresAt: { lte: now }, status: { not: "ready" } },
    data: { status: "failed", lastError: "jaas_link_expired" },
  });

  if (errors.length) {
    logError("recordings.ingest.failures", { count: errors.length, first: errors[0] });
  }

  return NextResponse.json({
    ok: true,
    scanned: candidates.length,
    pulled,
    skipped,
    expired,
    errors: errors.slice(0, 5),
  });
}
