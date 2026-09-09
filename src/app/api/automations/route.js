import { NextResponse } from "next/server";
import { createNotification } from "@/lib/server/notifications";
import { sendEmail } from "@/lib/server/email";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const INACTIVE_DAYS = 7;
const WELCOME_SENT_KEY = "welcomeSent";
const PAGE_SIZE = 500;

function daysSince(date) {
  if (!date) return Infinity;
  const d = date instanceof Date ? date : new Date(date);
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

async function* paginateUsers() {
  const prisma = getPrisma();
  let cursor = null;
  while (true) {
    const rows = await prisma.user.findMany({
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        notifications: true,
        createdAt: true,
        extra: true,
        gamification: {
          select: { points: true, badges: true, lastVisitDate: true },
        },
      },
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      yield row;
    }
    cursor = rows[rows.length - 1].id;
    if (rows.length < PAGE_SIZE) break;
  }
}

async function sendWelcomeMessages() {
  const prisma = getPrisma();
  let sent = 0;
  for await (const user of paginateUsers()) {
    if (user.extra?.[WELCOME_SENT_KEY]) continue;

    try {
      await createNotification({
        userId: user.id,
        type: "system",
        actorId: "system",
        actorName: "Secret Yarnery",
        href: "/dashboard",
        text: "Welcome to the community! Start by introducing yourself in the Feed or exploring the Members directory.",
      });

      if (user.email) {
        await sendEmail({
          to: user.email,
          subject: "Welcome to Secret Yarnery!",
          text: `Hi ${user.name || "there"},\n\nWelcome to the community! We're glad you're here.\n\nStart by introducing yourself in the Feed or exploring the Members directory.\n\nSee you inside!\n— Secret Yarnery`,
        }).catch(() => {});
      }

      const extra = { ...(user.extra || {}) };
      extra[WELCOME_SENT_KEY] = true;
      extra.welcomeSentAt = new Date();
      await prisma.user.update({
        where: { id: user.id },
        data: { extra, updatedAt: new Date() },
      });
      sent++;
    } catch (err) {
      console.error("automation.welcome_failed", user.id, err.message);
    }
  }
  return sent;
}

async function sendInactivityNudges() {
  const prisma = getPrisma();
  let sent = 0;
  for await (const user of paginateUsers()) {
    const gami = user.gamification;
    const lastVisit = gami?.lastVisitDate;
    const createdAt = user.createdAt;

    if (!lastVisit && daysSince(createdAt) < INACTIVE_DAYS) continue;
    if (lastVisit && daysSince(new Date(lastVisit)) < INACTIVE_DAYS) continue;
    if (user.notifications === "off") continue;

    const lastNudge = user.extra?.lastNudgeAt;
    if (lastNudge && daysSince(lastNudge) < INACTIVE_DAYS) continue;

    try {
      await createNotification({
        userId: user.id,
        type: "system",
        actorId: "system",
        actorName: "Secret Yarnery",
        href: "/feed",
        text: "We miss you! Check out what's new in the community.",
      });

      const extra = { ...(user.extra || {}) };
      extra.lastNudgeAt = new Date();
      await prisma.user.update({
        where: { id: user.id },
        data: { extra, updatedAt: new Date() },
      });
      sent++;
    } catch (err) {
      console.error("automation.nudge_failed", user.id, err.message);
    }
  }
  return sent;
}

async function awardAutoBadges() {
  const prisma = getPrisma();
  let awarded = 0;
  for await (const user of paginateUsers()) {
    const gami = user.gamification;
    const points = gami?.points || 0;
    const existing = gami?.badges || {};
    let changed = false;

    const milestones = [
      { at: 10, badge: "first-steps", label: "First Steps" },
      { at: 50, badge: "regular", label: "Regular" },
      { at: 100, badge: "powerhouse", label: "Powerhouse" },
      { at: 500, badge: "legend", label: "Community Legend" },
    ];

    for (const m of milestones) {
      if (points >= m.at && !existing[m.badge]) {
        existing[m.badge] = { name: m.label, earnedAt: new Date() };
        changed = true;
        await createNotification({
          userId: user.id,
          type: "system",
          actorId: "system",
          actorName: "Secret Yarnery",
          href: "/leaderboard",
          text: `You earned the "${m.label}" badge for reaching ${m.at} points!`,
        }).catch(() => {});
      }
    }

    if (changed) {
      try {
        await prisma.gamification.upsert({
          where: { id: user.id },
          create: {
            id: user.id,
            userId: user.id,
            points: points || 0,
            badges: existing,
          },
          update: { badges: existing },
        });
        awarded++;
      } catch (err) {
        logError("automation.badges_prisma_failed", { error: err.message, uid: user.id });
      }
    }
  }
  return awarded;
}

export async function POST(req) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = {};

  try {
    results.welcomeSent = await sendWelcomeMessages();
    results.nudgesSent = await sendInactivityNudges();
    results.badgesAwarded = await awardAutoBadges();
  } catch (err) {
    logError("automations.cron_failed", { error: err.message });
  }

  return NextResponse.json({ ok: true, ...results, timestamp: new Date().toISOString() });
}
