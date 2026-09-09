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
    musicUrl: row.musicUrl || "",
    musicPlaying: !!row.musicPlaying,
    musicFileId: row.musicFileId || "",
    imageUrl: row.imageUrl || "",
    createdBy: row.createdBy || "",
    createdAt: row.createdAt || null,
  };
}