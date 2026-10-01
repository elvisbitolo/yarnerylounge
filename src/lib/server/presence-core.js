export const PRESENCE_WINDOW_MS = 90_000;

export const ONLINE_MEMBER_LIMIT = 12;

export function lastActiveFrom(extra) {
  if (!extra || typeof extra !== "object") return null;
  return extra.lastActiveAt ?? null;
}

export function isOnline(lastActiveAt, now = Date.now(), windowMs = PRESENCE_WINDOW_MS) {
  const timestamp =
    typeof lastActiveAt === "number" ? lastActiveAt : Date.parse(lastActiveAt ?? "");
  return Number.isFinite(timestamp) && now - timestamp <= windowMs;
}

export function isOnlineRow(row, now = Date.now(), windowMs = PRESENCE_WINDOW_MS) {
  return isOnline(lastActiveFrom(row?.extra), now, windowMs);
}

export function onlineMembers(
  rows,
  { now = Date.now(), windowMs = PRESENCE_WINDOW_MS, excludeId = null, limit = ONLINE_MEMBER_LIMIT } = {}
) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && row.id !== excludeId && isOnlineRow(row, now, windowMs))
    .slice(0, limit)
    .map((row) => ({
      uid: row.id,
      name: row.name || "",
      photoURL: row.photoURL || "",
    }));
}
