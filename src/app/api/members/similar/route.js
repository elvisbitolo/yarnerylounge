import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { BLOCKED_KEY, isSafetyId } from "@/lib/server/member-safety";
import { compareMovingInPriority } from "@/lib/server/blind-date-core";
import { getMovingInPriorityIds } from "@/lib/server/match-priority";
import { withNotSuspended } from "@/lib/server/member-visibility-core";

function similarityScore(a, b) {
  let score = 0;
  let comparableWeight = 0;
  const values = (person, ...keys) => {
    const result = [];
    for (const key of keys) {
      const value = person?.[key] ?? person?.extra?.[key];
      if (Array.isArray(value)) result.push(...value);
      else if (typeof value === "string" && value.trim()) result.push(value.trim());
    }
    return [...new Set(result.map((value) => value.toLowerCase()))];
  };
  const overlap = (left, right) => {
    if (!left.length || !right.length) return 0;
    return left.filter((value) => right.includes(value)).length / Math.max(left.length, right.length);
  };
  // Missing profile fields are unknown, not evidence of incompatibility.
  const addSetSignal = (weight, ...keys) => {
    const left = values(a, ...keys);
    const right = values(b, ...keys);
    if (!left.length || !right.length) return;
    comparableWeight += weight;
    score += overlap(left, right) * weight;
  };
  if (a.country && b.country) {
    comparableWeight += 2;
    score += a.country === b.country ? 2 : 0.5;
  }
  const aTimezone = a.extra?.timezone || a.timezone || "";
  const bTimezone = b.extra?.timezone || b.timezone || "";
  if (aTimezone && bTimezone) {
    comparableWeight += 2;
    if (aTimezone.toLowerCase() === bTimezone.toLowerCase()) score += 2;
  }
  addSetSignal(3, "craftInterests", "crafts");
  addSetSignal(2, "projectTypes");
  addSetSignal(2, "hobbies", "crochetTechniques");
  addSetSignal(2, "communityGoals");
  const aYarn = a.yarnPreference || a.goToYarn || "";
  const bYarn = b.yarnPreference || b.goToYarn || "";
  if (aYarn && bYarn) {
    comparableWeight += 2;
    if (aYarn.toLowerCase() === bYarn.toLowerCase()) score += 2;
  }
  if (a.skillLevel && b.skillLevel) {
    comparableWeight += 1;
    if (a.skillLevel === b.skillLevel) score += 1;
  }
  if (a.favoriteHookSize && b.favoriteHookSize) {
    comparableWeight += 1.5;
    if (a.favoriteHookSize.toLowerCase() === b.favoriteHookSize.toLowerCase()) score += 1.5;
  }
  addSetSignal(2, "favoriteColors");
  const keywords = (value) => {
    if (!value) return new Set();
    return new Set(value.toLowerCase().split(/[\\s,;.!?]+/).filter((word) => word.length > 3));
  };
  const aKeywords = new Set([...keywords(a.headline), ...keywords(a.bio), ...keywords(a.goToYarn)]);
  const bKeywords = new Set([...keywords(b.headline), ...keywords(b.bio), ...keywords(b.goToYarn)]);
  if (aKeywords.size && bKeywords.size) {
    comparableWeight += 2;
    let shared = 0;
    aKeywords.forEach((word) => { if (bKeywords.has(word)) shared += 1; });
    score += (shared / Math.max(aKeywords.size, bKeywords.size)) * 2;
  }
  return comparableWeight > 0 ? score / comparableWeight : 0;
}

export async function GET(req) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  // Similarity is a member-facing endpoint. Never allow a caller to choose
  // another user's profile as the scoring baseline; doing so can disclose
  // private profile attributes through the returned ranking.
  const url = new URL(req.url);
  if (url.searchParams.has("for") && url.searchParams.get("for") !== auth.user.uid) {
    return NextResponse.json({ error: "Invalid match profile" }, { status: 403 });
  }
  const baseUid = auth.user.uid;
  const exclude = auth.user.uid;

  const prisma = getPrisma();

  const similaritySelect = {
    role: true,
    country: true,
    timezone: true,
    goToYarn: true,
    favoriteHookSize: true,
    favoriteColors: true,
    headline: true,
    bio: true,
    crafts: true,
    hobbies: true,
    crochetTechniques: true,
    craftInterests: true,
    projectTypes: true,
    communityGoals: true,
    skillLevel: true,
    yarnPreference: true,
    hookSize: true,
    extra: true,
  };
  let myData;
  try {
    const row = await prisma.user.findUnique({
      where: { id: baseUid },
      select: similaritySelect,
    });
    if (!row) {
      return NextResponse.json({ members: [] });
    }
    myData = row;
  } catch (err) {
    logError("similar.prisma_me_read_failed", { error: err.message });
    return NextResponse.json({ error: "Could not load member recommendations" }, { status: 500 });
  }

  const userSelect = {
    id: true,
    name: true,
    role: true,
    plan: true,
    headline: true,
    country: true,
    photoURL: true,
    favoriteColors: true,
    goToYarn: true,
    favoriteHookSize: true,
    bio: true,
    crafts: true,
    hobbies: true,
    crochetTechniques: true,
    craftInterests: true,
    projectTypes: true,
    communityGoals: true,
    skillLevel: true,
    yarnPreference: true,
    hookSize: true,
    extra: true,
  };
  let candidates;
  let movingInPriorityIds;
  try {
    const rows = await prisma.user.findMany({
      take: 500,
      where: withNotSuspended({ id: { not: exclude } }),
      select: userSelect,
    });
    movingInPriorityIds = await getMovingInPriorityIds(rows, prisma);
    candidates = rows
      .filter((r) => {
        const rExtra = r.extra && typeof r.extra === "object" ? r.extra : {};
        if (rExtra.profileVisibility === "private") {
          const role = myData?.role || "member";
          return role === "owner" || role === "moderator";
        }
        return true;
      })
      .map((r) => ({ id: r.id, ...r }));
  } catch (err) {
    logError("similar.prisma_read_failed", { error: err.message });
    return NextResponse.json({ error: "Could not load member recommendations" }, { status: 500 });
  }

  const scored = candidates
    .filter((c) => !isSafetyId(myData.extra, BLOCKED_KEY, c.id) && !isSafetyId(c.extra, BLOCKED_KEY, auth.user.uid))
    .map((c) => ({ ...c, score: similarityScore(myData, c) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => compareMovingInPriority(a, b, movingInPriorityIds) || b.score - a.score)
    .slice(0, 20)
    .map(({ score, ...member }) => ({
      id: member.id,
      name: member.name || "Member",
      role: member.role || "member",
      plan: member.plan || "flirting",
      headline: member.headline || "",
      country: member.country || "",
      photoURL: member.photoURL || "",
      favoriteColors: Array.isArray(member.favoriteColors) ? member.favoriteColors : [],
      goToYarn: member.goToYarn || "",
      favoriteHookSize: member.favoriteHookSize || "",
      score: Math.round(score * 100),
    }));

  return NextResponse.json({ members: scored });
}
