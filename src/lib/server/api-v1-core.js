import { BLOCKED_KEY } from "./member-safety-core.js";

export const API_PAGE_DEFAULT = 20;
export const API_PAGE_MAX = 50;
export const API_OFFSET_MAX = 10000;

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function clampLimit(value, { def = API_PAGE_DEFAULT, max = API_PAGE_MAX } = {}) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(n, max);
}

export function clampOffset(value, max = API_OFFSET_MAX) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

// The public shape of a member. Deliberately a subset of the in-app directory:
// profile fields a member already shows publicly, never quiz answers, billing,
// role labels, or private JSON.
export function publicMember(row) {
  if (!row) return null;
  const extra = asObject(row.extra);
  return {
    id: row.id,
    name: row.name || "",
    username: row.username || "",
    headline: row.headline || "",
    bio: row.bio || "",
    location: row.location || "",
    country: row.country || "",
    photoURL: row.photoURL || "",
    role: row.role || "member",
    crafts: asArray(row.crafts),
    hobbies: asArray(row.hobbies),
    skillLevel: extra.skillLevel || row.skillLevel || "",
    yearsExperience: extra.yearsExperience || row.yearsExperience || "",
    favoriteYarnBrand: row.favoriteYarnBrand || "",
    goToYarn: row.goToYarn || "",
    createdAt: toIso(row.createdAt),
  };
}

export function publicPost(row) {
  if (!row) return null;
  const likes = asObject(row.likes);
  return {
    id: row.id,
    kind: row.kind || "post",
    text: row.text || "",
    imageUrl: row.imageUrl || "",
    hashtags: asArray(row.hashtags),
    author: { id: row.authorId || null, name: row.authorName || "" },
    pinned: Boolean(row.pinned),
    likeCount: Object.keys(likes).length,
    commentCount: row.commentCount || 0,
    createdAt: toIso(row.createdAt),
  };
}

export function publicEvent(row, creatorName = "") {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || "",
    description: row.description || "",
    startTime: toIso(row.startTime),
    endTime: toIso(row.endTime),
    roomSlug: row.roomSlug || "",
    capacity: row.capacity || 0,
    creator: { id: row.createdBy || null, name: creatorName || "" },
  };
}

// Applies the directory's visibility rules to a raw user row: private profiles
// stay hidden from non-moderators, and blocks cut both ways.
export function isMemberVisible(row, { viewerId = "", canModerate = false, blockedIds = [] } = {}) {
  if (!row || !row.name) return false;
  const extra = asObject(row.extra);
  if (extra.profileVisibility === "private" && !canModerate) return false;
  if (viewerId && blockedIds.includes(row.id)) return false;
  if (viewerId && asArray(extra[BLOCKED_KEY]).includes(viewerId)) return false;
  return true;
}

export function matchesMemberQuery(row, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const hay = [
    row.name,
    row.username,
    row.headline,
    row.location,
    row.country,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}
