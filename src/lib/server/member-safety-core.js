export const BLOCKED_KEY = "blockedMemberIds";
export const MUTED_KEY = "mutedMemberIds";

export function idsFromExtra(extra, key) {
  const ids = extra && typeof extra === "object" && Array.isArray(extra[key]) ? extra[key] : [];
  return [...new Set(ids.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()))];
}

export function isSafetyId(extra, key, id) {
  return Boolean(id) && idsFromExtra(extra, key).includes(id);
}

export function updateSafetyExtra(extra, key, targetId, enabled) {
  const next = { ...(extra && typeof extra === "object" ? extra : {}) };
  const ids = idsFromExtra(next, key).filter((id) => id !== targetId);
  if (enabled) ids.push(targetId);
  next[key] = ids;
  return next;
}
