export const AVAILABILITY_MAX_TITLE = 60;
export const AVAILABILITY_MAX_NOTE = 300;
export const AVAILABILITY_MAX_MINUTES = 24 * 60;
export const AVAILABILITY_MIN_MINUTES = 15;

export const CALENDAR_ROOMS = [
  { slug: "happy-hour-hub", name: "Happy Hour Hub", color: "#e91e63" },
  { slug: "lo-fi-and-loops", name: "Lo-Fi & Loops", color: "#2dd4bf" },
  { slug: "velvet-den", name: "The Velvet Den", color: "#a78bfa" },
  { slug: "silent-studio", name: "The Silent Studio", color: "#94a3b8" },
];

export function roomColorFor(slug) {
  return CALENDAR_ROOMS.find((r) => r.slug === slug)?.color || "#a78bfa";
}

export function roomNameFor(slug) {
  return CALENDAR_ROOMS.find((r) => r.slug === slug)?.name || slug || "Any lounge";
}

export function toIso(v) {
  if (!v) return null;
  if (typeof v.toMillis === "function") return new Date(v.toMillis()).toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") return new Date(v).toISOString();
  if (typeof v === "string") return v;
  return null;
}

export function serializeAvailability(docOrRow) {
  const data = typeof docOrRow?.data === "function" ? docOrRow.data() : docOrRow;
  const id = typeof docOrRow?.data === "function" ? docOrRow.id : docOrRow.id;
  return {
    id,
    userId: data.userId || "",
    userName: data.userName || "",
    userAvatar: data.userAvatar || "",
    title: data.title || "",
    note: data.note || "",
    roomSlug: data.roomSlug || "",
    roomName: roomNameFor(data.roomSlug),
    color: data.color || roomColorFor(data.roomSlug),
    startAt: toIso(data.startAt),
    endAt: toIso(data.endAt),
    recurring: data.recurring === "weekly" ? "weekly" : "none",
    rsvpCount: data.rsvpCount || 0,
    createdAt: toIso(data.createdAt),
  };
}

export function nextOccurrenceAt(slot, now = new Date()) {
  const startAt = new Date(slot.startAt);
  if (!Number.isFinite(startAt.getTime())) return null;
  if (slot.recurring !== "weekly") {
    return startAt.getTime() >= now.getTime() ? startAt.toISOString() : null;
  }
  const nowMs = now.getTime();
  const dayMs = 7 * 24 * 60 * 60 * 1000;
  const k = Math.max(0, Math.ceil((nowMs - startAt.getTime()) / dayMs));
  return new Date(startAt.getTime() + k * dayMs).toISOString();
}