// Pure decision logic for the Daily Blind Date — no I/O, so it can be unit
// tested with node:test. See blind-date.js for the storage layer (Prisma-backed).

export function dayKeyFor(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

export const MATCH_WINDOW_MS = 24 * 60 * 60 * 1000;

export function matchExpiresAt(createdAt) {
  const createdAtMs = Date.parse(createdAt);
  return Number.isFinite(createdAtMs) ? createdAtMs + MATCH_WINDOW_MS : null;
}

export function isMatchWindowOpen(createdAt, now = Date.now()) {
  const expiresAt = matchExpiresAt(createdAt);
  return expiresAt !== null && now < expiresAt;
}

export function compareMovingInPriority(a, b, priorityIds) {
  return Number(priorityIds.has(b.id)) - Number(priorityIds.has(a.id));
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

// --- timezone proximity -----------------------------------------------------
// The shop page promises matching on location/timezone, but computeScore() only
// ever compared `country`. Two members in the same country nine hours apart
// scored exactly the same as next-door neighbours, and members in different
// countries who share a timezone got nothing.
//
// Timezone lives in two places: the User.timezone column (written by no route
// until now) and extra.timezone (written by /api/onboarding). Accept both so
// scoring works for members onboarded either way.

export function memberTimezone(member) {
  const fromExtra = member?.extra && typeof member.extra === "object" ? member.extra.timezone : "";
  return String(fromExtra || member?.timezone || "").trim();
}

// UTC offset in hours for an IANA zone at a given instant, or null if the zone
// is unknown/unsupported. Uses Intl rather than a lookup table so DST is
// handled correctly for both hemispheres.
export function utcOffsetHours(timeZone, when = Date.now()) {
  if (!timeZone) return null;
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = {};
    for (const { type, value } of dtf.formatToParts(new Date(when))) parts[type] = value;
    // Build the wall-clock time the zone shows, then compare it to UTC.
    const asUTC = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute),
      Number(parts.second)
    );
    return Math.round(((asUTC - when) / 36e5) * 60) / 60;
  } catch {
    // Unknown IANA zone, or an environment without full ICU.
    return null;
  }
}

// 0..1, where 1 means the same zone. Bucketed by hours apart rather than a
// smooth curve: for a craft community, "same evening" is the thing that matters,
// not a precise distance.
export function timezoneProximity(a, b, when = Date.now()) {
  const za = memberTimezone(a);
  const zb = memberTimezone(b);
  if (!za || !zb) return 0;
  if (za.toLowerCase() === zb.toLowerCase()) return 1;

  const oa = utcOffsetHours(za, when);
  const ob = utcOffsetHours(zb, when);
  if (oa === null || ob === null) return 0;

  const diff = Math.abs(oa - ob);
  if (diff <= 1) return 0.75;
  if (diff <= 3) return 0.5;
  if (diff <= 6) return 0.25;
  return 0.1;
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
  // 3 rather than 4 so an explicit country match stays the strongest single
  // location signal, while two members in different countries who share a
  // timezone still earn meaningful credit.
  const tz = timezoneProximity(me, member);
  const raw =
    shared +
    hobbyOverlap * 3 +
    craftOverlap * 2 +
    colorOverlap * 2 +
    sameCountry * 4 +
    tz * 3;
  return raw * tierWeight(member);
}