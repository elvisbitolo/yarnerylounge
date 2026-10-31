import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/server/email";
import { createNotification } from "@/lib/server/notifications";
import { logError } from "@/lib/server/log";
import { CANONICAL_ORIGIN } from "@/lib/server/origin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_DAYS = new Set([7, 3, 1]);
const ACTIVE_STATUSES = ["active", "trialing", "past_due"];
const SITE_BASE = process.env.NEXT_PUBLIC_APP_URL || CANONICAL_ORIGIN;
const RENEWAL_URL = "https://secretyarnery.com/pages/speakeasy";

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

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function buildReminder({ name, tier, daysLeft, expiryDate }) {
  const details = tierDetails(tier);
  const safeName = escapeHtml(name || "there");
  const date = expiryDate.toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
  const expired = daysLeft === 0;
  const subject = expired
    ? "Your Speakeasy membership has expired"
    : daysLeft === 1
      ? "Your Speakeasy membership expires tomorrow"
      : `Your ${details.label} membership expires in ${daysLeft} days`;
  const heading = expired
    ? "Your membership has expired"
    : daysLeft === 1
      ? "One day left to keep your current tier"
      : `${daysLeft} days left on your ${details.label} membership`;
  const intro = expired
    ? "Your paid membership period has ended. Your account now has the Flirting (Front Parlor) level of access. Renew to restore your previous membership benefits."
    : `Your ${details.label} membership is scheduled to end on <strong>${date}</strong>. Renew before then to keep your current access without interruption.`;
  const losses = details.loss.map((item) => `<li style="margin:0 0 9px;">${escapeHtml(item)}</li>`).join("");
  const text = [
    `Hi ${name || "there"},`,
    heading,
    expired
      ? "Your account has moved to Flirting (The Front Parlor Pass)."
      : `Your membership ends on ${date}.`,
    `If you do not renew, you will lose: ${details.loss.join("; ")}.`,
    `Renew your membership: ${RENEWAL_URL}`,
    `Open your community: ${SITE_BASE}/membership`,
  ].join("\n\n");
  const html = `
    <p>Hi ${safeName},</p>
    <h2 style="margin:0 0 14px;color:#171717;font-size:19px;">${heading}</h2>
    <p>${intro}</p>
    <p style="margin:22px 0 10px;font-weight:700;">What changes if you move to Flirting?</p>
    <p>Flirting keeps your Front Parlor community access, profile, events and sharing basics. It does not include these paid-tier privileges:</p>
    <ul style="padding-left:22px;margin:12px 0 22px;">${losses}</ul>
    <p>Keep the rooms, connections and features that make the Speakeasy feel like your place. Renew your membership before your paid access ends.</p>
    <p style="margin:24px 0;">
      <a href="${RENEWAL_URL}" style="display:inline-block;background:#f6077a;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:8px;">Renew my membership</a>
    </p>
    <p style="font-size:13px;color:#666;">You can review your current membership at <a href="${SITE_BASE}/membership">your membership page</a>.</p>
  `;
  return { subject, text, html };
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

    const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / DAY_MS);
    const isExpiredWindow = daysLeft <= 0 && now.getTime() - expiryDate.getTime() <= 36 * 60 * 60 * 1000;
    if (!REMINDER_DAYS.has(daysLeft) && !isExpiredWindow) { stats.skipped++; continue; }

    const tier = canonicalTier(sub.tier || sub.plan || sub.planName);
    if (tier === "flirting") { stats.skipped++; continue; }

    try {
      const member = await prisma.user.findUnique({
        where: { id: uid },
        select: { id: true, name: true, email: true, role: true, notifications: true, notificationPreferences: true },
      });
      if (!member?.email || member.notifications === "off" ||
          member.notificationPreferences?.emailMembership === false ||
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

      const message = buildReminder({ name: member.name, tier, daysLeft: isExpiredWindow ? 0 : daysLeft, expiryDate });
      const emailResult = await sendEmail({ to: member.email, ...message });
      if (emailResult?.skipped) throw new Error("Email provider is not configured; reminder was not recorded");
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
