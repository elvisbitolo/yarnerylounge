import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { getCapabilities, canUseMatchmaker } from "@/lib/server/capabilities";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { BLOCKED_KEY, isSafetyId } from "@/lib/server/member-safety";

function similarityScore(a, b) {
  let score = 0;
  let max = 0;

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

  const addSetSignal = (weight, ...keys) => {
    max += weight;
    score += overlap(values(a, ...keys), values(b, ...keys)) * weight;
  };

  const locationWeight = 2;
  max += locationWeight;
  if (a.country && b.country && a.country === b.country) score += locationWeight;
  else if (a.country && b.country) score += 0.5;

  const timezoneWeight = 2;
  max += timezoneWeight;
  const aTimezone = a.extra?.timezone || a.timezone || "";
  const bTimezone = b.extra?.timezone || b.timezone || "";
  if (aTimezone && bTimezone && aTimezone.toLowerCase() === bTimezone.toLowerCase()) score += timezoneWeight;

  addSetSignal(3, "craftInterests", "crafts");
  addSetSignal(2, "projectTypes");
  addSetSignal(2, "hobbies", "crochetTechniques");
  addSetSignal(2, "communityGoals");

  const yarnWeight = 2;
  max += yarnWeight;
  const aYarn = a.yarnPreference || a.goToYarn || "";
  const bYarn = b.yarnPreference || b.goToYarn || "";
  if (aYarn && bYarn && aYarn.toLowerCase() === bYarn.toLowerCase()) score += yarnWeight;

  const skillWeight = 1;
  max += skillWeight;
  if (a.skillLevel && b.skillLevel && a.skillLevel === b.skillLevel) score += skillWeight;

  const hookWeight = 1.5;
  max += hookWeight;
  if (a.favoriteHookSize && b.favoriteHookSize && a.favoriteHookSize.toLowerCase() === b.favoriteHookSize.toLowerCase()) {
    score += hookWeight;
  }

  addSetSignal(2, "favoriteColors");

  const textWeight = 2;
  max += textWeight;
  const keywords = (s) => {
    if (!s) return new Set();
    return new Set(s.toLowerCase().split(/[\s,;.!?]+/).filter((w) => w.length > 3));
  };
  const aKw = new Set([...keywords(a.headline), ...keywords(a.bio), ...keywords(a.goToYarn)]);
  const bKw = new Set([...keywords(b.headline), ...keywords(b.bio), ...keywords(b.goToYarn)]);
  if (aKw.size && bKw.size) {
    let overlap = 0;
    aKw.forEach((w) => { if (bKw.has(w)) overlap++; });
    score += (overlap / Math.max(aKw.size, bKw.size)) * textWeight;
  }

  return max > 0 ? score / max : 0;
}

export async function GET(req) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const caps = await getCapabilities(auth.user.uid);
  if (!canUseMatchmaker(caps)) {
    return NextResponse.json({ members: [] });
  }

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
    country: true,
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
    return NextResponse.json({ members: [] });
  }

  const userSelect = {
    name: true,
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
  try {
    const rows = await prisma.user.findMany({
      take: 500,
      where: { id: { not: exclude }, suspended: { not: true } },
      select: userSelect,
    });
    candidates = rows.map((r) => ({ id: r.id, ...r }));
  } catch (err) {
    logError("similar.prisma_read_failed", { error: err.message });
    candidates = [];
  }

  const scored = candidates
    .filter((c) => !isSafetyId(myData.extra, BLOCKED_KEY, c.id) && !isSafetyId(c.extra, BLOCKED_KEY, auth.user.uid))
    .map((c) => ({ ...c, score: similarityScore(myData, c) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(({ score, ...member }) => ({
      id: member.id,
      name: member.name || "Member",
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
