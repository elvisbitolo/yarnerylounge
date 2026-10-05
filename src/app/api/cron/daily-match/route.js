import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { createNotification } from "@/lib/server/notifications";
import { pickDailyBlindDate } from "@/lib/server/blind-date";
import { dayKeyFor } from "@/lib/server/blind-date-core";
import { getCapabilities, canUseMatchmaker } from "@/lib/server/capabilities";
import { ACTIVE_STATUSES } from "@/lib/server/billing";
import { logError } from "@/lib/server/log";

// "Automatic 24-Hour Matching" is sold on the shop page, but nothing ran it.
// The Daily Match was computed lazily inside pickDailyBlindDate() when a member
// happened to open the page, and no notification was ever sent - so a member
// could be "matched" and never know it. This job makes the match happen on a
// schedule and tells the member about it.
//
// Runs once a day (see vercel.json). Idempotent in two layers: a member who
// already has a stored pick for today is skipped, and a member who already
// received today's notification is skipped even if their pick is recomputed.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH = 500;

// Members who could have a Daily Match. The authoritative eligibility rule is
// canUseMatchmaker(), so this only narrows the set cheaply and lets the real
// resolver decide per member - duplicating tier logic here would drift.
async function eligibleUids() {
  const prisma = getPrisma();
  if (!prisma) return [];
  const ids = new Set();

  try {
    const subs = await prisma.subscription.findMany({
      where: { status: { in: ACTIVE_STATUSES } },
      select: { id: true, userId: true },
    });
    for (const s of subs) {
      if (s.userId) ids.add(s.userId);
      else if (s.id) ids.add(s.id);
    }
  } catch (err) {
    logError("cron.daily_match.subs_failed", { error: err.message });
  }

  // Staff carry the top tier by role rather than by subscription row.
  try {
    const staff = await prisma.user.findMany({
      where: { role: { in: ["owner", "moderator", "host"] } },
      select: { id: true },
    });
    for (const u of staff) ids.add(u.id);
  } catch (err) {
    logError("cron.daily_match.staff_failed", { error: err.message });
  }

  return [...ids];
}

export async function GET(req) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrisma();
  if (!prisma) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const today = dayKeyFor();
  const uids = await eligibleUids();
  let processed = 0;
  let skipped = 0;
  let alreadyMatched = 0;
  let notEligible = 0;
  let notified = 0;
  let failed = 0;

  // One shared candidate pool for the whole run (see pickDailyBlindDate).
  let pool = [];
  try {
    pool = await prisma.user.findMany({ take: 500 });
  } catch (err) {
    logError("cron.daily_match.pool_failed", { error: err.message });
  }

  for (const uid of uids.slice(0, BATCH)) {
    try {
      const caps = await getCapabilities(uid);
      if (!canUseMatchmaker(caps)) {
        notEligible += 1;
        continue;
      }

      // Do not notify twice about the same day's match, even if the pick is
      // recomputed because the chosen member later went private or blocked.
      const existing = await prisma.notification.findFirst({
        where: { userId: uid, type: "daily_match", targetId: `${uid}:${today}` },
        select: { id: true },
      });

      const hadPick = await prisma.blindDate.findFirst({
        where: { uid, date: today },
        select: { id: true },
      });
      if (hadPick) alreadyMatched += 1;

      const pick = await pickDailyBlindDate(uid, pool);
      if (!pick?.memberId) {
        skipped += 1;
        continue;
      }
      processed += 1;

      if (existing) continue;
      await createNotification({
        userId: uid,
        type: "daily_match",
        targetId: `${uid}:${today}`,
        href: "/match",
        text: `Today's fiber match is ${pick.memberName}. Say hello while the thread is fresh.`,
      });
      notified += 1;
    } catch (err) {
      failed += 1;
      logError("cron.daily_match.user_failed", { error: err.message, uid });
    }
  }

  return NextResponse.json({
    date: today,
    eligible: uids.length,
    cappedAt: BATCH,
    processed,
    notified,
    skipped,
    alreadyMatched,
    notEligible,
    failed,
  });
}