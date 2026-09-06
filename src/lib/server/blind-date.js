import { adminDb } from "@/lib/firebase/admin";

const BLIND_DATE_COLLECTION = "blindDates";
const DAY_MS = 24 * 60 * 60 * 1000;

function dayKeyFor(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

function hashingKey(uid, date = "") {
  return `${uid}:${date}`;
}

// Deterministic, stable per user+day ordering so the same user sees the
// same curated profile all day (Daily Blind Date).
function seededPick(candidates, uid, date) {
  let seed = 0;
  const str = hashingKey(uid, date);
  for (let i = 0; i < str.length; i++) {
    seed = (seed * 31 + str.charCodeAt(i)) >>> 0;
  }
  return candidates[seed % candidates.length];
}

function profilePieces(member) {
  const bio = `${member.headline || ""} ${member.bio || ""} ${member.goToYarn || ""}`;
  const hobbies = Array.isArray(member.hobbies) ? member.hobbies.join(" ") : "";
  const crafts = Array.isArray(member.crafts) ? member.crafts.join(" ") : "";
  const location = member.country || member.location || "";
  return `${bio} ${hobbies} ${crafts} ${location} ${member.favoriteHookSize || ""} ${
    Array.isArray(member.favoriteColors) ? member.favoriteColors.join(" ") : ""
  }`.toLowerCase();
}

function tierWeight(member) {
  // Moving In / hosts matchmaker is a premium signal; Flirting users get
  // matched but are view-only, so weight the shared craft signals instead.
  if (member.role === "host") return 1.3;
  if (member.role === "moderator") return 1.2;
  return 1;
}

function computeScore(me, member) {
  const mine = profilePieces(me);
  const theirs = profilePieces(member);
  const myWords = new Set(mine.split(/\s+/).filter((w) => w.length > 3));
  const theirWords = new Set(theirs.split(/\s+/).filter((w) => w.length > 3));
  let shared = 0;
  myWords.forEach((w) => { if (theirWords.has(w)) shared++; });
  const hobbyOverlap = Array.isArray(me.hobbies) && Array.isArray(member.hobbies)
    ? me.hobbies.filter((h) => member.hobbies.includes(h)).length
    : 0;
  const craftOverlap = Array.isArray(me.crafts) && Array.isArray(member.crafts)
    ? me.crafts.filter((c) => member.crafts.includes(c)).length
    : 0;
  const colorOverlap = Array.isArray(me.favoriteColors) && Array.isArray(member.favoriteColors)
    ? me.favoriteColors.filter((c) => member.favoriteColors.includes(c)).length
    : 0;
  const sameCountry = me.country && member.country && me.country === member.country ? 1 : 0;
  const raw =
    shared +
    hobbyOverlap * 3 +
    craftOverlap * 2 +
    colorOverlap * 2 +
    sameCountry * 4;
  return raw * tierWeight(member);
}

export async function pickDailyBlindDate(uid) {
  const today = dayKeyFor();
  const meSnap = await adminDb().collection("users").doc(uid).get();
  if (!meSnap.exists) return null;
  const me = meSnap.data();

  // Reuse today's pick if already stored (server-authoritative).
  const existing = await adminDb()
    .collection(BLIND_DATE_COLLECTION)
    .doc(hashingKey(uid, today))
    .get();
  if (existing.exists) {
    const data = existing.data();
    if (data.memberId) {
      const memberSnap = await adminDb().collection("users").doc(data.memberId).get();
      if (memberSnap.exists) {
        return { ...data, member: memberSnap.data() };
      }
    }
  }

  const snap = await adminDb()
    .collection("users")
    .limit(500)
    .get();

  const candidates = snap.docs
    .filter((doc) => doc.id !== uid)
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((m) => m.name)
    .sort((a, b) => computeScore(me, b) - computeScore(me, a))
    .slice(0, 40);

  if (!candidates.length) return null;

  const pick = seededPick(candidates, uid, today);
  const entry = {
    uid,
    date: today,
    memberId: pick.id,
    memberName: pick.name,
    photoURL: pick.photoURL || "",
    headline: pick.headline || "",
    country: pick.country || "",
    hobbies: Array.isArray(pick.hobbies) ? pick.hobbies : [],
    crafts: Array.isArray(pick.crafts) ? pick.crafts : [],
    score: computeScore(me, pick),
    createdAt: new Date().toISOString(),
  };

  await adminDb()
    .collection(BLIND_DATE_COLLECTION)
    .doc(hashingKey(uid, today))
    .set(entry);

  return { ...entry, member: pick };
}

export async function clearDailyBlindDate(uid, date = "") {
  const key = hashingKey(uid, date || dayKeyFor());
  await adminDb().collection(BLIND_DATE_COLLECTION).doc(key).delete();
}