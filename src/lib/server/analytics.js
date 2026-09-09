import { getPrisma } from "@/lib/db/prisma";
import { getLeaderboard } from "@/lib/server/gamification";
import { getCourse } from "@/lib/server/courses";
import { getEvent } from "@/lib/server/events";
import { getSpace, getSpaceMembers } from "@/lib/server/spaces";
import { isActiveSub } from "@/lib/server/billing";
import { logError } from "@/lib/server/log";
import {
  startOfDay,
  visitKey,
  summarizeSubscriptions,
  summarizePurchases,
  rankTopPosts,
  monthlyRateCents,
} from "@/lib/server/analytics-core";

const COUNT_MODELS = {
  users: "user",
  rsvps: "rsvp",
  courses: "course",
  lessons: "lesson",
  progress: "progress",
  posts: "post",
  gamification: "gamification",
};

export async function getAnalytics() {
  const now = Date.now();
  const todayStart = new Date(startOfDay(0));
  const days7Ago = new Date(startOfDay(7));
  const days30Ago = new Date(startOfDay(30));
  const visit7 = visitKey(7);

  const prisma = getPrisma();
  if (prisma) {
    try {
      const [
        usersCount,
        signups7,
        signups30,
        active7,
        postsCount,
        posts7,
        commentsCount,
        rsvpsCount,
        coursesCount,
        lessonsCount,
        progressCount,
        subscriptions,
        purchases,
        posts,
        rsvps,
        comments,
        lessons,
        progressDocs,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: days7Ago } } }),
        prisma.user.count({ where: { createdAt: { gte: days30Ago } } }),
        prisma.gamification.count({ where: { lastVisitDate: { gte: visit7 } } }),
        prisma.post.count(),
        prisma.post.count({ where: { createdAt: { gte: days7Ago } } }),
        prisma.postComment.count({ where: { createdAt: { gte: todayStart } } }),
        prisma.rsvp.count(),
        prisma.course.count(),
        prisma.lesson.count(),
        prisma.progress.count(),
        prisma.subscription.findMany(),
        prisma.purchase.findMany(),
        prisma.post.findMany(),
        prisma.rsvp.findMany(),
        prisma.postComment.findMany(),
        prisma.lesson.findMany(),
        prisma.progress.findMany(),
      ]);
      return await finalizeAnalyticsReport({
        usersCount,
        signups7,
        signups30,
        active7,
        postsCount,
        posts7,
        commentsCount,
        rsvpsCount,
        coursesCount,
        lessonsCount,
        progressCount,
        subscriptions,
        purchases,
        posts: normalizePosts(posts),
        rsvps,
        comments,
        lessons,
        progressDocs,
        now,
      });
    } catch (err) {
      logError("analytics.prisma_get_failed", { error: err.message });
    }
  }

  return {
    members: { total: 0, signups: { total: 0, last7: 0, last30: 0 }, active7: 0, contributing: 0 },
    engagement: { posts: 0, posts7: 0, comments: 0, rsvps: 0, rsvpMembers: 0 },
    courses: { total: 0, lessons: 0, learners: 0, completions: 0, completionRate: 0 },
    revenue: { subscriptions: { active: 0, estimatedMonthlyCents: 0 }, purchases: { total: 0, revenueCents: 0 }, recurringMonthlyCents: 0, oneTimeCents: 0 },
    topContent: [],
    topMembers: [],
  };
}

function normalizePosts(rows) {
  return rows.map((r) => {
    const millis = (v) => (v == null ? null : v instanceof Date ? v.getTime() : v);
    return {
      id: r.id,
      authorId: r.authorId || "",
      authorName: r.authorName || "",
      text: r.text || "",
      likes: r.likes && typeof r.likes === "object" ? r.likes : {},
      commentCount: r.commentCount || 0,
      createdAt: millis(r.createdAt) || 0,
    };
  });
}

async function finalizeAnalyticsReport({
  usersCount,
  signups7,
  signups30,
  active7,
  postsCount,
  posts7,
  commentsCount,
  rsvpsCount,
  coursesCount,
  lessonsCount,
  progressCount,
  subscriptions,
  purchases,
  posts,
  rsvps,
  comments,
  lessons,
  progressDocs,
  now,
}) {
  const lessonCountByCourse = {};
  lessons.forEach((lesson) => {
    if (lesson.courseId) {
      lessonCountByCourse[lesson.courseId] = (lessonCountByCourse[lesson.courseId] || 0) + 1;
    }
  });

  let completions = 0;
  progressDocs.forEach((doc) => {
    const courseId = doc.courseId || String(doc.id || "").split("_")[0];
    const lessonCount = lessonCountByCourse[courseId] || 0;
    if (lessonCount > 0 && (doc.completedLessons || []).length >= lessonCount) {
      completions += 1;
    }
  });

  const contributors = new Set();
  posts.forEach((post) => post.authorId && contributors.add(post.authorId));
  comments.forEach((doc) => {
    if (doc.authorId) contributors.add(doc.authorId);
  });
  rsvps.forEach((rsvp) => rsvp.userId && contributors.add(rsvp.userId));

  const rsvpMembers = new Set();
  rsvps.forEach((rsvp) => rsvp.userId && rsvpMembers.add(rsvp.userId));

  const commentCountByPost = {};
  comments.forEach((doc) => {
    if (doc.postId) {
      commentCountByPost[doc.postId] = (commentCountByPost[doc.postId] || 0) + 1;
    }
  });

  const subs = subscriptions.map((s) => ({ id: s.id || "", ...s }));
  const priceMap = {};

  const resolved = await Promise.all(
    purchases.map(async (p) => {
      const loader =
        p.targetType === "course"
          ? getCourse
          : p.targetType === "event"
            ? getEvent
            : getSpace;
      let priceCents = null;
      try {
        const item = await loader(p.targetId);
        priceCents = Number(item?.purchasePriceCents) || 0;
      } catch {
        priceCents = null;
      }
      return { targetType: p.targetType || "", targetId: p.targetId || "", priceCents };
    })
  );

  const topPosts = rankTopPosts(
    posts.map((post) => ({ ...post, commentCount: commentCountByPost[post.id] || 0 }))
  );
  const subscriptionSummary = summarizeSubscriptions(subs, priceMap, now);
  const purchasesSummary = summarizePurchases(resolved);
  const topMembers = await getLeaderboard(10);

  return {
    members: {
      total: usersCount,
      signups: { total: usersCount, last7: signups7, last30: signups30 },
      active7,
      contributing: contributors.size,
    },
    engagement: {
      posts: postsCount,
      posts7,
      comments: commentsCount,
      rsvps: rsvpsCount,
      rsvpMembers: rsvpMembers.size,
    },
    courses: {
      total: coursesCount,
      lessons: lessonsCount,
      learners: progressCount,
      completions,
      completionRate: progressCount > 0 ? Math.round((completions / progressCount) * 100) : 0,
    },
    revenue: {
      subscriptions: subscriptionSummary,
      purchases: purchasesSummary,
      recurringMonthlyCents: subscriptionSummary.estimatedMonthlyCents,
      oneTimeCents: purchasesSummary.revenueCents,
    },
    topContent: topPosts,
    topMembers,
  };
}

function monthKey(date) {
  const ms =
    date && typeof date.toMillis === "function"
      ? date.toMillis()
      : date instanceof Date
        ? date.getTime()
        : new Date(date).getTime();
  const d = new Date(Number.isFinite(ms) ? ms : NaN);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function last12Months() {
  const keys = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 11; i >= 0; i -= 1) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    keys.push(monthKey(m));
  }
  return keys;
}

export async function getRelevantPriceCents(targetType, targetId) {
  if (!targetType || !targetId) return 0;
  const loader =
    targetType === "course"
      ? getCourse
      : targetType === "event"
        ? getEvent
        : getSpace;
  try {
    const item = await loader(targetId);
    return Number(item?.purchasePriceCents) || 0;
  } catch {
    return 0;
  }
}

export async function getRevenueAnalytics() {
  const months = last12Months();
  const buckets = {};
  months.forEach((m) => {
    buckets[m] = { subscriptions: 0, purchases: 0, total: 0, subCount: 0, purchaseCount: 0 };
  });

  const prisma = getPrisma();
  if (prisma) {
    try {
      const subs = await prisma.subscription.findMany();
      subs.forEach((sub) => {
        if (!isActiveSub(sub)) return;
        const m = monthKey(sub.currentPeriodStart ?? sub.createdAt ?? sub.trialStart);
        if (!buckets[m]) return;
        const rate = monthlyRateCents({ unitAmountCents: sub.unitAmountCents, unit_amount: sub.unitAmountCents, interval: sub.plan });
        buckets[m].subscriptions += rate;
        buckets[m].subCount += 1;
        buckets[m].total += rate;
      });

      const purchaseRows = await prisma.purchase.findMany();
      await Promise.all(
        purchaseRows.map(async (p) => {
          const m = monthKey(p.purchasedAt ?? p.createdAt);
          if (!buckets[m]) return;
          const price = await getRelevantPriceCents(p.targetType, p.targetId);
          buckets[m].purchases += price;
          buckets[m].purchaseCount += 1;
          buckets[m].total += price;
        })
      );
    } catch (err) {
      logError("analytics.prisma_revenue_failed", { error: err.message });
    }
  }

  return months.map((m) => ({
    month: m,
    subscriptions: buckets[m].subscriptions,
    purchases: buckets[m].purchases,
    total: buckets[m].total,
  }));
}

export async function getSpaceAnalytics(spaceId) {
  const space = await getSpace(spaceId);
  if (!space) return null;

  const members = await getSpaceMembers(spaceId);
  const memberIds = members.map((m) => m.userId);

  let posts = [];
  let gamification = {};
  const prisma = getPrisma();
  if (prisma) {
    try {
      const postRows = await prisma.post.findMany({ where: { spaceId } });
      posts = postRows.map((row) => ({ id: row.id, ...row }));
      const gRows = memberIds.length
        ? await prisma.gamification.findMany({ where: { id: { in: memberIds.slice(0, 30) } } })
        : [];
      gRows.forEach((row) => {
        gamification[row.id] = row;
      });
    } catch (err) {
      logError("analytics.prisma_space_failed", { error: err.message, spaceId });
    }
  }

  const visit7 = visitKey(7);
  let activeThisWeek = 0;
  members.forEach((m) => {
    const g = gamification[m.userId];
    if (g && (g.lastVisitDate || "") >= visit7) activeThisWeek += 1;
  });

  const topContent = rankTopPosts(posts);
  const topMemberCounts = {};
  const authorNames = {};
  posts.forEach((post) => {
    if (post.authorId) topMemberCounts[post.authorId] = (topMemberCounts[post.authorId] || 0) + 1;
    if (post.authorId && post.authorName) authorNames[post.authorId] = post.authorName;
  });
  const topMembers = Object.entries(topMemberCounts)
    .map(([authorId, count]) => ({
      authorId,
      authorName: authorNames[authorId] || "Member",
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    posts: posts.length,
    members: members.length,
    activeMembers: activeThisWeek,
    topContent,
    topMembers,
    recentActivity: [],
  };
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowsToCsv(section, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = rows.map((row) => headers.map((h) => csvEscape(row[h])).join(","));
  return `${section}\n${headers.map(csvEscape).join(",")}\n${lines.join("\n")}\n`;
}

export async function buildAnalyticsCsv() {
  const data = await getAnalytics();
  const revenue = await getRevenueAnalytics();

  const sections = [];
  sections.push("# Secret Yarnery Analytics Export");
  sections.push(`Generated: ${new Date().toISOString()}\n`);

  sections.push(
    rowsToCsv(
      "Member Summary",
      [
        {
          metric: "total_members",
          value: data.members.total,
        },
        {
          metric: "new_last_7_days",
          value: data.members.signups.last7,
        },
        {
          metric: "new_last_30_days",
          value: data.members.signups.last30,
        },
        {
          metric: "active_last_7_days",
          value: data.members.active7,
        },
        {
          metric: "contributing",
          value: data.members.contributing,
        },
      ]
    )
  );

  sections.push(
    rowsToCsv(
      "Engagement Metrics",
      [
        { metric: "posts", value: data.engagement.posts },
        { metric: "posts_last_7_days", value: data.engagement.posts7 },
        { metric: "comments", value: data.engagement.comments },
        { metric: "rsvps", value: data.engagement.rsvps },
        { metric: "rsvp_members", value: data.engagement.rsvpMembers },
      ]
    )
  );

  sections.push(
    rowsToCsv(
      "Revenue Summary",
      [
        {
          metric: "estimated_recurring_monthly_cents",
          value: data.revenue.subscriptions.estimatedMonthlyCents,
        },
        {
          metric: "one_time_revenue_cents",
          value: data.revenue.purchases.revenueCents,
        },
        {
          metric: "active_subscriptions",
          value: data.revenue.subscriptions.active,
        },
      ]
    )
  );

  sections.push(
    rowsToCsv(
      "Revenue by Month",
      revenue.map((r) => ({ ...r }))
    )
  );

  sections.push(
    rowsToCsv(
      "Top Content",
      data.topContent.map((p) => ({
        id: p.id,
        text: p.text,
        authorName: p.authorName,
        likes: p.likeCount,
        comments: p.commentCount,
        score: p.score,
      }))
    )
  );

  sections.push(
    rowsToCsv(
      "Top Members",
      data.topMembers.map((m) => ({
        rank: m.rank,
        name: m.name,
        points: m.points,
        badges: m.badgeCount,
      }))
    )
  );

  return sections.join("\n");
}
