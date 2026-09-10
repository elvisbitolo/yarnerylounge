// Pure helpers for the rooms storage cutover — no I/O, unit-testable.
// See rooms.js for the storage layer (Prisma-first, Firestore fallback).

export function mapRoomRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || "",
    slug: row.slug || row.id,
    description: row.description || "",
    status: row.status || "active",
    maxParticipants: row.maxParticipants ?? 20,
    groupId: row.groupId || "",
    spaceId: row.spaceId || "",
    kind: row.kind || "standard",
    publicPreview: !!row.publicPreview,
    opensAt: row.opensAt || null,
    alwaysOn: !!row.alwaysOn,
    color: row.color || "",
    vibe: row.vibe || "",
    vibeMode: row.vibeMode || "",
    rule: row.rule || "",
    autoAudioVideo: !!row.autoAudioVideo,
    forceMuteOnJoin: !!row.forceMuteOnJoin,
    raiseHandToTalk: !!row.raiseHandToTalk,
    disableAudio: !!row.disableAudio,
    musicUrl: row.musicUrl || "",
    musicPlaying: !!row.musicPlaying,
    musicFileId: row.musicFileId || "",
    imageUrl: row.imageUrl || "",
    createdBy: row.createdBy || "",
    createdAt: row.createdAt || null,
  };
}

/**
 * Returns whether a room can be entered right now. Always-on rooms are live
 * regardless of an accidental/stale opensAt value; scheduled rooms open once
 * their start time has passed (or when no start time is configured).
 */
export function isRoomLive(room, now = Date.now()) {
  if (!room || room.status === "deleted") return false;
  if (room.alwaysOn) return true;
  if (!room.opensAt) return true;

  const opensAt = room.opensAt?.toMillis
    ? room.opensAt.toMillis()
    : room.opensAt instanceof Date
      ? room.opensAt.getTime()
      : typeof room.opensAt === "number"
        ? room.opensAt
        : Number(room.opensAt);

  return !Number.isFinite(opensAt) || opensAt <= now;
}
