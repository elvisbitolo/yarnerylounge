import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/server/email";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function POST(req) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - ONE_WEEK);

  const prisma = getPrisma();
  const topPosts = [];
  try {
    const rows = await prisma.post.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, text: true, authorName: true, likes: true, createdAt: true },
    });
    for (const r of rows) {
      const created = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
      if (created < since) continue;
      const likeCount = r.likes && typeof r.likes === "object" ? Object.keys(r.likes).length : 0;
      topPosts.push({ id: r.id, text: r.text || "", author: r.authorName || "Member", likes: likeCount });
    }
  } catch (err) {
    logError("digest.prisma_posts_read_failed", { error: err.message });
  }
  topPosts.sort((a, b) => b.likes - a.likes);
  topPosts.length = Math.min(topPosts.length, 5);

  let upcomingEvents = [];
  try {
    const rows = await prisma.event.findMany({
      where: { startTime: { gte: new Date() } },
      orderBy: { startTime: "asc" },
      take: 10,
      select: { title: true, startTime: true },
    });
    upcomingEvents = rows.map((r) => {
      const date = r.startTime instanceof Date ? r.startTime : new Date(r.startTime);
      return {
        title: r.title || "Event",
        date: isNaN(date.getTime()) ? "Date TBD" : date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
        location: "Online",
      };
    }).slice(0, 3);
  } catch (err) {
    logError("digest.prisma_events_read_failed", { error: err.message });
  }

  let postsHtml = "";
  if (topPosts.length > 0) {
    postsHtml = topPosts.map((p) => {
      const preview = escapeHtml(p.text.slice(0, 120));
      return `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;">
            <strong style="color:#333;">${escapeHtml(p.author)}</strong>
            <span style="color:#999;margin-left:8px;">${p.likes} likes</span>
            <p style="margin:4px 0 0;color:#555;font-size:14px;">${preview}${p.text.length > 120 ? "..." : ""}</p>
          </td>
        </tr>`;
    }).join("");
  } else {
    postsHtml = `<tr><td style="padding:16px;color:#999;font-size:14px;">No posts this week yet.</td></tr>`;
  }

  let eventsHtml = "";
  if (upcomingEvents.length > 0) {
    eventsHtml = upcomingEvents.map((e) => `
      <tr>
        <td style="padding:8px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;">
          <strong style="color:#333;">${escapeHtml(e.title)}</strong>
          <span style="color:#7c3aed;margin-left:8px;">${escapeHtml(e.date)}</span>
          <span style="color:#999;margin-left:8px;">${escapeHtml(e.location)}</span>
        </td>
      </tr>`).join("");
  } else {
    eventsHtml = `<tr><td style="padding:16px;color:#999;font-size:14px;">No upcoming events.</td></tr>`;
  }

  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="background:linear-gradient(135deg,#2563eb,#7c3aed);padding:32px 24px;border-radius:12px 12px 0 0;">
        <h1 style="color:#fff;font-size:22px;margin:0;">This Week at Secret Yarnery</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:8px 0 0;">Your weekly community digest</p>
      </div>
      <div style="background:#fff;padding:8px 0;border-radius:0 0 12px 12px;border:1px solid #eee;border-top:none;">
        <h2 style="font-size:16px;color:#333;padding:16px 16px 8px;margin:0;">Top Posts</h2>
        <table style="width:100%;border-collapse:collapse;">${postsHtml}</table>
        <h2 style="font-size:16px;color:#333;padding:24px 16px 8px;margin:0;">Upcoming Events</h2>
        <table style="width:100%;border-collapse:collapse;">${eventsHtml}</table>
        <div style="padding:20px 16px;text-align:center;">
          <a href="https://yarnerylounge.vercel.app/feed" style="color:#7c3aed;font-size:14px;font-weight:600;text-decoration:none;">Visit community &rarr;</a>
        </div>
      </div>
    </div>`;

  const textParts = [];
  textParts.push("=== THIS WEEK AT VIDNETWORK ===\n");
  textParts.push("Top Posts:");
  topPosts.forEach((p, i) => {
    textParts.push(`  ${i + 1}. ${p.author} (${p.likes} likes): ${p.text.slice(0, 100)}`);
  });
  textParts.push("\nUpcoming Events:");
  upcomingEvents.forEach((e) => {
    textParts.push(`  - ${e.title} | ${e.date} | ${e.location}`);
  });
  textParts.push(`\nVisit: https://yarnerylounge.vercel.app/feed`);

  let usersForDigest = [];
  try {
    const rows = await prisma.user.findMany({
      take: 200,
      select: { email: true, extra: true },
    });
    usersForDigest = rows.map((r) => ({ email: r.email, emailPreferences: r.extra?.emailPreferences }));
  } catch (err) {
    logError("digest.prisma_users_read_failed", { error: err.message });
  }
  let sent = 0;
  let skipped = 0;

  for (const u of usersForDigest) {
    if (!u.email) { skipped++; continue; }
    if (u.emailPreferences?.weeklyDigest === false) { skipped++; continue; }

    try {
      await sendEmail({
        to: u.email,
        subject: "This Week at Secret Yarnery",
        text: textParts.join("\n"),
        html,
      });
      sent++;
    } catch (err) {
      skipped++;
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    skipped,
    topPosts: topPosts.length,
    upcomingEvents: upcomingEvents.length,
    timestamp: new Date().toISOString(),
  });
}
