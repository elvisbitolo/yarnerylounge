const IMPRESSION_SESSION_RE = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_IMPRESSION_BATCH = 50;

function newSessionKey() {
  try {
    const existing = typeof window !== "undefined"
      ? sessionStorage.getItem("feed:impression-session")
      : null;
    if (existing) return existing;
    const key = (typeof crypto !== "undefined" && crypto?.randomUUID?.())
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 32)
      : (Math.random().toString(36) + "x".repeat(32)).slice(0, 32);
    if (typeof window !== "undefined") sessionStorage.setItem("feed:impression-session", key);
    return key;
  } catch {
    const key = Math.random().toString(36).slice(2);
    return key;
  }
}

function sanitizeImpressionPayload(body) {
  if (!body || typeof body !== "object") return null;
  const { sessionKey, postIds } = body;
  if (!typeof sessionKey === "string" || !IMPRESSION_SESSION_RE.test(sessionKey)) return null;
  const ids = Array.isArray(postIds) ? postIds : [];
  if (ids.length > MAX_IMPRESSION_BATCH) return null;
  const clean = ids.filter(id => typeof id === "string" && id.length > 0 && id.length <= 64);
  return clean.length ? { sessionKey, postIds: clean } : null;
}

function isTrackablePost({ postId, authorId, spaceId, groupId, hidden, archivedAt, scheduledAt, deletedAt }, { uid, isStaff, spaces, groups, now } = {}) {
  if (authorId === uid) return false;
  if (deletedAt) return false;
  if (archivedAt) return false;
  if (hidden && !isStaff) return false;
  if (scheduledAt && scheduledAt > (now || Date.now()) && !isStaff) return false;
  if (spaceId && !spaces?.has(spaceId) && !isStaff) return false;
  if (groupId && !groups?.has(groupId) && !isStaff) return false;
  return true;
}

export { IMPRESSION_SESSION_RE, MAX_IMPRESSION_BATCH, newSessionKey, sanitizeImpressionPayload, isTrackablePost };