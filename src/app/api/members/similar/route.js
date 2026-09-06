import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { getCapabilities, canUseMatchmaker } from "@/lib/server/capabilities";
import { adminDb } from "@/lib/firebase/admin";

function similarityScore(a, b) {
  let score = 0;
  let max = 0;

  const locationWeight = 3;
  max += locationWeight;
  if (a.country && b.country && a.country === b.country) score += locationWeight;
  else if (a.country && b.country) score += 0.5;

  const yarnWeight = 2;
  max += yarnWeight;
  if (a.goToYarn && b.goToYarn && a.goToYarn.toLowerCase() === b.goToYarn.toLowerCase()) {
    score += yarnWeight;
  }

  const hookWeight = 1.5;
  max += hookWeight;
  if (a.favoriteHookSize && b.favoriteHookSize && a.favoriteHookSize.toLowerCase() === b.favoriteHookSize.toLowerCase()) {
    score += hookWeight;
  }

  const colorWeight = 2;
  max += colorWeight;
  const aColors = Array.isArray(a.favoriteColors) ? a.favoriteColors : [];
  const bColors = Array.isArray(b.favoriteColors) ? b.favoriteColors : [];
  if (aColors.length && bColors.length) {
    const shared = aColors.filter((c) => bColors.includes(c)).length;
    score += (shared / Math.max(aColors.length, bColors.length)) * colorWeight;
  }

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

  const url = new URL(req.url);
  const forUid = url.searchParams.get("for") || null;
  const baseUid = forUid || auth.user.uid;
  const exclude = forUid || auth.user.uid;

  const me = await adminDb().collection("users").doc(baseUid).get();
  if (!me.exists) {
    return NextResponse.json({ members: [] });
  }
  const myData = me.data();

  const snap = await adminDb().collection("users").limit(500).get();
  const candidates = snap.docs
    .filter((doc) => doc.id !== exclude)
    .map((doc) => ({ id: doc.id, ...doc.data() }));

  const scored = candidates
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
