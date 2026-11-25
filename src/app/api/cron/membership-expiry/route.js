import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { createNotification } from "@/lib/server/notifications";
import { logError } from "@/lib/server/log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_DAYS = new Set([7, 3, 1]);
const ACTIVE_STATUSES = ["active", "trialing", "past_due"];

function canonicalTier(value) {
  const tier = String(value || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (["hooking-up", "plus", "premium", "creator", "paid"].includes(tier)) return "hooking-up";
  if (["moving-in", "host"].includes(tier)) return "moving-in";
  return "flirting";
}

function tierDetails(tier) {
  if (tier === "moving-in") {
    return {
      label: "Moving In",
      loss: [
        "Your ability to host public and private live rooms",
        "Your ability to create crochet circles and subgroups",
        "Your exclusive Diamond profile badge",
        "The Hooking Up benefits listed below",
      ],
    };
  }
  return {
    label: "Hooking Up",
    loss: [
      "Access to 24/7 live video lounges",
      "Live video with your camera and microphone",
      "Lounge text chat",
      "Daily Match",
      "Joining crochet circles and community groups",
    ],
  };
}

export async function GET(req) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });

  const now = new Date();
  const lookback = new Date(now.getTime() - 36 * 60 * 60 * 1000);
  const lookahead = new Date(now.getTime() + 8 * DAY_MS);
  let subscriptions;
  try {
    subscriptions = await prisma.subscription.findMany({
      where: {
        status: { in: ACTIVE_STATUSES },
        currentPeriodEnd: { gte: lookback, lte: lookahead },
        provider: { not: "open-access" },
      },
      orderBy: { currentPeriodEnd: "asc" },
      take: 1000,
      select: {
        id: true, userId: true, tier: true, plan: true, planName: true,
        status: true, currentPeriodEnd: true,
      },
    });
  } catch (err) {
    logError("membership_expiry.subscriptions_failed", { error: err.message });
    return NextResponse.json({ ok: false, error: "Could not load subscriptions" }, { status: 503 });
  }

  const stats = { scanned: subscriptions.length, sent: 0, skipped: 0, failed: 0 };
  for (const sub of subscriptions) {
    const uid = sub.userId || sub.id;
    const expiryDate = sub.currentPeriodEnd instanceof Date ? sub.currentPeriodEnd : new Date(sub.currentPeriodEnd);
    if (!uid || Number.isNaN(expiryDate.getTime())) { stats.skipped++; continue; }

    // Round to the nearest calendar day so a fixed daily cron does not miss a
    // milestone merely because the subscription renews later in the day.
    const daysLeft = Math.round((expiryDate.getTime() - now.getTime()) / DAY_MS);
    const isExpiredWindow = expiryDate.getTime() <= now.getTime() &&
      now.getTime() - expiryDate.getTime() <= 36 * 60 * 60 * 1000;
    if (!REMINDER_DAYS.has(daysLeft) && !isExpiredWindow) { stats.skipped++; continue; }

    const tier = canonicalTier(sub.tier || sub.plan || sub.planName);
    if (tier === "flirting") { stats.skipped++; continue; }

    try {
      const member = await prisma.user.findUnique({
        where: { id: uid },
        select: { id: true, name: true, role: true, notifications: true },
      });
      if (!member || member.notifications === "off" ||
          ["owner", "moderator", "host"].includes(String(member.role || "").toLowerCase())) {
        stats.skipped++;
        continue;
      }

      const milestone = isExpiredWindow ? "expired" : String(daysLeft);
      const targetId = `${sub.id}:${expiryDate.toISOString()}:${milestone}`;
      const existing = await prisma.notification.findFirst({
        where: { userId: uid, type: "membership_expiry", targetId },
        select: { id: true },
      });
      if (existing) { stats.skipped++; continue; }

      await createNotification({
        userId: uid,
        type: "membership_expiry",
        actorName: "Christa's Speakeasy",
        targetId,
        href: "/membership",
        text: isExpiredWindow
          ? "Your paid membership has expired. Renew to restore your previous tier and benefits."
          : `Your ${tierDetails(tier).label} membership expires in ${daysLeft} day(s). Renew to keep your current benefits.`,
      });
      stats.sent++;
    } catch (err) {
      stats.failed++;
      logError("membership_expiry.member_failed", { uid, subscriptionId: sub.id, error: err.message });
    }
  }

  return NextResponse.json({ ok: stats.failed === 0, ...stats, timestamp: new Date().toISOString() });
}
