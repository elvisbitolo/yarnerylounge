// Pure decision logic for the Daily Blind Date — no I/O, so it can be unit
// tested with node:test. See blind-date.js for the storage layer (Prisma-backed).

export function dayKeyFor(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

// Composite key: one pick per user per day.
export function hashingKey(uid, date = "") {
  return `${uid}:${date}`;
}

// Deterministic, stable per user+day ordering so the same user sees the same
// curated profile all day (Daily Blind Date).
export function seededPick(candidates, uid, date) {
  if (!candidates || !candidates.length) return null;
  let seed = 0;
  const str = hashingKey(uid, date);
  for (let i = 0; i < str.length; i++) {
    seed = (seed * 31 + str.charCodeAt(i)) >>> 0;
  }
  return candidates[seed % candidates.length];
}

export function profilePieces(member) {
  const bio = `${member.headline || ""} ${member.bio || ""} ${member.goToYarn || ""}`;
  const hobbies = Array.isArray(member.hobbies) ? member.hobbies.join(" ") : "";
  const crafts = Array.isArray(member.crafts) ? member.crafts.join(" ") : "";
  const location = member.country || member.location || "";
  return `${bio} ${hobbies} ${crafts} ${location} ${member.favoriteHookSize || ""} ${
    Array.isArray(member.favoriteColors) ? member.favoriteColors.join(" ") : ""
  }`.toLowerCase();
}

export function tierWeight(member) {
  // Moving In / hosts matchmaker is a premium signal; Flirting users get
  // matched but are view-only, so weight the shared craft signals instead.
  if (member.role === "host") return 1.3;
  if (member.role === "moderator") return 1.2;
  return 1;
}

export function computeScore(me, member) {
  const mine = profilePieces(me);
  const theirs = profilePieces(member);
  const myWords = new Set(mine.split(/\s+/).filter((w) => w.length > 3));
  const theirWords = new Set(theirs.split(/\s+/).filter((w) => w.length > 3));
  let shared = 0;
  myWords.forEach((w) => {
    if (theirWords.has(w)) shared++;
  });
  const hobbyOverlap =
    Array.isArray(me.hobbies) && Array.isArray(member.hobbies)
      ? me.hobbies.filter((h) => member.hobbies.includes(h)).length
      : 0;
  const craftOverlap =
    Array.isArray(me.crafts) && Array.isArray(member.crafts)
      ? me.crafts.filter((c) => member.crafts.includes(c)).length
      : 0;
  const colorOverlap =
    Array.isArray(me.favoriteColors) && Array.isArray(member.favoriteColors)
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