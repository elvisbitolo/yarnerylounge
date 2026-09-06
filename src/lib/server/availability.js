import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export const AVAILABILITY_MAX_TITLE = 60;
export const AVAILABILITY_MAX_NOTE = 300;
export const AVAILABILITY_MAX_MINUTES = 24 * 60;
export const AVAILABILITY_MIN_MINUTES = 15;

export const CALENDAR_ROOMS = [
  { slug: "happy-hour-hub", name: "Happy Hour Hub", color: "#f472b6" },
  { slug: "lo-fi-and-loops", name: "Lo-Fi & Loops", color: "#2dd4bf" },
  { slug: "velvet-accent-den", name: "The Velvet Accent Den", color: "#a78bfa" },
  { slug: "silent-studio", name: "The Silent Studio", color: "#94a3b8" },
];

export function roomColorFor(slug) {
  return CALENDAR_ROOMS.find((r) => r.slug === slug)?.color || "#a78bfa";
}

export function roomNameFor(slug) {
  return CALENDAR_ROOMS.find((r) => r.slug === slug)?.name || slug || "Any room";
}

export function serializeAvailability(doc) {
  const data = doc.data();
  const toIso = (v) => {
    if (!v) return null;
    if (v.toMillis) return new Date(v.toMillis()).toISOString();
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "number") return new Date(v).toISOString();
    if (typeof v === "string") return v;
    return null;
  };
  return {
    id: doc.id,
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

export async function listAvailability({ from, to }) {
  let query = adminDb().collection("availability").orderBy("startAt", "asc");
  if (from) query = query.startAt(new Date(from));
  if (to) query = query.endAt(new Date(to));
  const snap = await query.limit(500).get();
  return snap.docs.map(serializeAvailability);
}

export async function getAvailability(id) {
  const doc = await adminDb().collection("availability").doc(id).get();
  return doc.exists ? serializeAvailability(doc) : null;
}

export async function listAvailabilityRsvps(availabilityId) {
  const snap = await adminDb()
    .collection("availabilityRsvps")
    .where("availabilityId", "==", availabilityId)
    .orderBy("joinedAt", "asc")
    .get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    availabilityId: doc.data().availabilityId || doc.id,
    userId: doc.data().userId || "",
    name: doc.data().name || "",
    joinedAt: (doc.data().joinedAt?.toMillis ? new Date(doc.data().joinedAt.toMillis()).toISOString() : ""),
  }));
}

export async function toggleAvailabilityRsvp(availabilityId, user) {
  const ref = adminDb().collection("availability").doc(availabilityId);
  const result = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { error: "Slot not found", status: 404 };
    const data = snap.data();
    const rsvpRef = adminDb()
      .collection("availabilityRsvps")
      .doc(`${availabilityId}_${user.uid}`);
    const exists = (await tx.get(rsvpRef)).exists;
    if (exists) {
      tx.delete(rsvpRef);
      tx.update(ref, {
        rsvpCount: Math.max(0, (data.rsvpCount || 0) - 1),
      });
      return { joined: false, hostId: data.userId, title: data.title };
    }
    tx.set(rsvpRef, {
      availabilityId,
      userId: user.uid,
      name: user.name || "Member",
      joinedAt: new Date(),
    });
    tx.update(ref, {
      rsvpCount: (data.rsvpCount || 0) + 1,
    });
    return { joined: true, hostId: data.userId, title: data.title };
  });
  return result;
}

export async function createAvailability({ userId, userName, userAvatar, title, note, roomSlug, startAt, endAt, recurring }) {
  const color = roomColorFor(roomSlug);
  const ref = adminDb().collection("availability").doc();
  await ref.set({
    userId,
    userName: userName || "Member",
    userAvatar: userAvatar || "",
    title,
    note: note || "",
    roomSlug: roomSlug || "",
    color,
    startAt: new Date(startAt),
    endAt: new Date(endAt),
    recurring: recurring === "weekly" ? "weekly" : "none",
    rsvpCount: 0,
    createdAt: new Date(),
  });
  return { id: ref.id };
}

export async function deleteAvailability(id, uid) {
  const ref = adminDb().collection("availability").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { error: "Slot not found", status: 404 };
  if (snap.data().userId !== uid) return { error: "You can only delete your own slots", status: 403 };
  const rsvpsSnap = await adminDb()
    .collection("availabilityRsvps")
    .where("availabilityId", "==", id)
    .get();
  const batch = adminDb().batch();
  rsvpsSnap.docs.forEach((doc) => batch.delete(doc.ref));
  batch.delete(ref);
  await batch.commit();
  return { ok: true };
}

export { FieldValue };