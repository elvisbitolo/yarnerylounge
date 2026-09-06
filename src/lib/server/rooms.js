import { adminDb } from "@/lib/firebase/admin";
import { deleteDocs } from "@/lib/server/delete";

export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function listRooms() {
  const snap = await adminDb().collection("rooms").orderBy("createdAt", "desc").get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function listRoomsForGroup(groupId) {
  const snap = await adminDb()
    .collection("rooms")
    .where("groupId", "==", groupId)
    .get();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
}

export async function getRoom(id) {
  const doc = await adminDb().collection("rooms").doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

export async function getRoomBySlug(slug) {
  const snap = await adminDb().collection("rooms").where("slug", "==", slug).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

export async function createRoom({ name, description, maxParticipants, groupId, spaceId, kind, publicPreview, createdBy, opensAt }) {
  const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
  const ref = adminDb().collection("rooms").doc();
  await ref.set({
    name,
    slug,
    description: description || "",
    status: "active",
    maxParticipants,
    groupId: groupId || "",
    spaceId: spaceId || "",
    kind: kind === "broadcast" ? "broadcast" : "standard",
    publicPreview: !!publicPreview,
    opensAt: opensAt || null,
    createdBy,
    createdAt: new Date(),
  });
  return { id: ref.id, slug, name, description };
}

async function endLiveKitRoom(slug) {
  const host = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!host || !key || !secret || !slug) return;
  try {
    const { RoomServiceClient } = await import("livekit-server-sdk");
    const url = new URL(host);
    const client = new RoomServiceClient(`${url.protocol}//${url.host}`, key, secret);
    const rooms = await client.listRooms();
    if (rooms.some((r) => r.name === slug)) {
      await client.deleteRoom(slug);
    }
  } catch {
    // Room teardown is best-effort; the Firestore record is still removed.
  }
}

export async function deleteRoom(room) {
  await endLiveKitRoom(room.slug);
  const eventsSnap = await adminDb()
    .collection("roomEvents")
    .where("roomId", "==", room.id)
    .get();
  await deleteDocs(eventsSnap.docs);
  await adminDb().collection("rooms").doc(room.id).delete();
}

export const ALWAYS_ON_ROOMS = [
  {
    slug: "happy-hour-hub",
    name: "Happy Hour Hub",
    description: "The official welcome mat — high-energy, loud, and chatty. The #1 spot for new members to introduce themselves, make friends, and show off yarn hauls.",
    musicName: "Upbeat lounge grooves",
    vibe: "social",
    color: "#f472b6",
  },
  {
    slug: "lo-fi-and-loops",
    name: "Lo-Fi & Loops",
    description: "Solo-focused flow for introverts. Members log in to craft side-by-side; microphones stay muted by default, text chat for quick hellos.",
    musicName: "Cozy lo-fi hip-hop beats",
    vibe: "focus",
    color: "#2dd4bf",
  },
  {
    slug: "velvet-accent-den",
    name: "The Velvet Accent Den",
    description: "Calm, intimate, and supportive — like a coffee-shop corner. Mics welcome but voices stay soft for pattern help and gentle storytelling.",
    musicName: "Ambient drones & cinematic piano",
    vibe: "calm",
    color: "#a78bfa",
  },
  {
    slug: "silent-studio",
    name: "The Silent Studio",
    description: "Zero-distraction accountability zone. Cameras on for company, but absolute silence — bring your own focus soundtrack.",
    musicName: "",
    vibe: "silent",
    color: "#94a3b8",
  },
];

export async function seedAlwaysOnRooms() {
  const created = [];
  for (const spec of ALWAYS_ON_ROOMS) {
    const snap = await adminDb()
      .collection("rooms")
      .where("slug", "==", spec.slug)
      .limit(1)
      .get();
    if (!snap.empty) {
      const doc = snap.docs[0];
      const data = doc.data();
      const patch = { alwaysOn: true };
      if (data.name !== spec.name) patch.name = spec.name;
      if (data.description !== spec.description) patch.description = spec.description;
      if (!data.vibe) patch.vibe = spec.vibe;
      if (!data.color) patch.color = spec.color;
      if (Object.keys(patch).length > 0) {
        await doc.ref.set(patch, { merge: true });
      }
      created.push({ id: doc.id, slug: spec.slug, name: spec.name, alwaysOn: true });
      continue;
    }

    const ref = adminDb().collection("rooms").doc();
    const room = {
      name: spec.name,
      slug: spec.slug,
      description: spec.description,
      status: "active",
      maxParticipants: 200,
      groupId: "",
      spaceId: "",
      kind: "standard",
      publicPreview: true,
      opensAt: null,
      alwaysOn: true,
      vibe: spec.vibe,
      color: spec.color,
      createdBy: "system",
      createdAt: new Date(),
    };
    await ref.set(room);
    created.push({ id: ref.id, slug: spec.slug, name: spec.name, alwaysOn: true });
  }
  return created;
}

export async function seedAlwaysOnRoom() {
  return seedAlwaysOnRooms();
}
