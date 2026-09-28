// Pure helpers for the rooms storage cutover — no I/O, unit-testable.
// See rooms.js for the storage layer (Prisma-backed).

export function mapRoomRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    persisted: true,
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
    pinned: !!row.pinned,
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

/**
 * Orders live rooms for the nav's "live now" banner and returns the first
 * `limit`. The banner shows room[0] and collapses the rest into "+N more", so
 * the order decides which single room leads.
 *
 * Pinned first: that is an explicit choice about which room to promote, so it
 * has to beat both the broadcast tier and creation order. Otherwise the lead
 * room is whichever room happens to be newest, which is why the banner can
 * change to a room nobody chose just by adding an unrelated one.
 */
export function pickBannerRooms(liveRooms, limit = 5) {
  // Lower sorts first. Four tiers, in order: pinned, pinned broadcast, plain
  // broadcast, then everything else.
  const tier = (room) => {
    if (room.pinned) return 0;
    return (room.kind || "standard") === "broadcast" ? 1 : 2;
  };

  return [...liveRooms]
    .sort((a, b) => {
      const diff = tier(a) - tier(b);
      if (diff !== 0) return diff;
      return (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);
    })
    .slice(0, limit);
}
