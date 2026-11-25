export const LIVE_ANNOUNCER_EMAIL =
  process.env.LOUNGE_LIVE_ANNOUNCER_EMAIL || "secretyarnery@gmail.com";

export const LIVE_ANNOUNCER_NAME = "Christa";

export function pickAnnouncerRoom(rows, { ownerEmail = LIVE_ANNOUNCER_EMAIL } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const wanted = String(ownerEmail).trim().toLowerCase();

  const candidates = rows.filter(
    (row) =>
      String(row?.user?.email || "").trim().toLowerCase() === wanted &&
      row?.room &&
      row.room.status !== "deleted"
  );
  if (candidates.length !== 1) return null;
  return candidates[0].room;
}
