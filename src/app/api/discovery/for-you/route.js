import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { logError } from "@/lib/server/log";

export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const userDoc = await getUserDoc(user.uid);
  const userData = userDoc || {};
  const interests = [
    ...(Array.isArray(userData.crafts) ? userData.crafts : []),
    ...(Array.isArray(userData.interests) ? userData.interests : []),
    ...(Array.isArray(userData.hashtags) ? userData.hashtags : []),
  ].map((s) => String(s).toLowerCase().trim()).filter(Boolean);

  // Postgres-first pool readers for the discovery pools (posts by the user,
  // latest posts, active spaces, published courses).
  const prisma = getPrisma();
  let source;
  try {
    const [ownRows, postRows, spaceRows, courseRows] = await Promise.all([
      prisma.post.findMany({
        where: { authorId: user.uid },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { hashtags: true },
      }),
      prisma.post.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.space.findMany({ where: { status: "active" }, take: 50 }),
      prisma.course.findMany({ where: { status: "published" }, take: 50 }),
    ]);
    source = {
      ownPosts: ownRows.map((r) => r.hashtags || []),
      posts: postRows.map((r) => ({ ...r, _type: "post" })),
      spaces: spaceRows.map((r) => ({ ...r, _type: "space" })),
      courses: courseRows.map((r) => ({ ...r, _type: "course" })),
    };
  } catch (err) {
    logError("discovery.prisma_read_failed", { error: err.message });
    return NextResponse.json({ error: "Could not load discovery" }, { status: 500 });
  }

  const ownHashtags = [];
  for (const tags of source.ownPosts) {
    if (!Array.isArray(tags)) continue;
    for (const t of tags) {
      const clean = String(t).toLowerCase().trim();
      if (clean && ownHashtags.indexOf(clean) === -1 && ownHashtags.length < 8) {
        ownHashtags.push(clean);
      }
    }
  }
  const allInterests = [...interests, ...ownHashtags];
  const interestsSet = new Set(allInterests);

  function scoreItem(item) {
    let score = 0;
    const text = ((item.text || "") + " " + (item.description || "") + " " + (item.title || "")).toLowerCase();
    for (const interest of interestsSet) {
      if (text.includes(interest)) score += 10;
    }
    const tags = item.hashtags || [];
    for (const tag of tags) {
      if (interestsSet.has(String(tag).toLowerCase())) score += 5;
    }
    if (item.likes) score += Object.keys(item.likes).length * 0.5;
    return score;
  }

  function getReason(item) {
    const text = ((item.text || "") + " " + (item.description || "") + " " + (item.title || "")).toLowerCase();
    for (const interest of allInterests) {
      if (text.includes(interest)) {
        const label = interest.charAt(0).toUpperCase() + interest.slice(1);
        return `Because you like ${label}`;
      }
    }
    return null;
  }

  return NextResponse.json({
    posts: source.posts
      .map((item) => ({ ...item, _score: scoreItem(item), _reason: getReason(item) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 10)
      .map(({ _score, _reason, ...item }) => item),
    spaces: source.spaces
      .map((item) => ({ ...item, _score: scoreItem(item), _reason: getReason(item) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 10)
      .map(({ _score, _reason, ...item }) => item),
    courses: source.courses
      .map((item) => ({ ...item, _score: scoreItem(item), _reason: getReason(item) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 10)
      .map(({ _score, _reason, ...item }) => item),
  });
}