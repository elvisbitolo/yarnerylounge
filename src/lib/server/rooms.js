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
  try {
    const snap = await adminDb().collection("rooms").orderBy("createdAt", "desc").get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch {
    // Backend/quota unavailable — serve the canonical Speakeasy lounges.
    return ALWAYS_ON_ROOMS.map(canonicalDefaultRoom);
  }
}

export async function listRoomsForGroup(groupId) {
  try {
    const snap = await adminDb()
      .collection("rooms")
      .where("groupId", "==", groupId)
      .get();
    return snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  } catch {
    return [];
  }
}

export async function getRoom(id) {
  try {
    const doc = await adminDb().collection("rooms").doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  } catch {
    return null;
  }
}

export async function getRoomBySlug(slug) {
  try {
    const snap = await adminDb().collection("rooms").where("slug", "==", slug).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch {
    // Fall back to the hardcoded always-open Speakeasy lounges.
    const spec = ALWAYS_ON_ROOMS.find((r) => r.slug === slug);
    return spec ? canonicalDefaultRoom(spec) : null;
  }
}

// Builds a minimal, fully-hardcoded room from an always-on spec so the lounge
// keeps opening even when Firestore is down (quota exceeded, 5xx, etc.).
function canonicalDefaultRoom(spec) {
  return {
    id: spec.slug,
    slug: spec.slug,
    name: spec.name,
    description: spec.description,
    status: "active",
    kind: "standard",
    alwaysOn: true,
    color: spec.color || "",
    vibe: spec.vibe || "",
    vibeMode: spec.vibeMode || "",
    rule: spec.rule || "",
    musicUrl: "",
    musicPlaying: false,
    musicFileId: "",
    createdBy: "",
    maxParticipants: 20,
    opensAt: null,
    createdAt: new Date(0),
  };
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

async function endLiveKitRoom() {
  // LiveKit was replaced by Jitsi as a Service; nothing to tear down server-side.
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
    color: "#e91e63",
    rule: "Turn your camera and mic ON. This is the loud, friendly welcome room — show your face and say hi!",
    vibeMode: "auto",
    autoAudioVideo: true,
    forceMuteOnJoin: false,
    raiseHandToTalk: false,
    disableAudio: false,
  },
  {
    slug: "lo-fi-and-loops",
    name: "Lo-Fi & Loops",
    description: "Solo-focused flow for introverts. Members log in to craft side-by-side; microphones stay muted by default, text chat for quick hellos.",
    musicName: "Cozy lo-fi hip-hop beats",
    vibe: "focus",
    color: "#2dd4bf",
    rule: "Mics start muted. This is a flow room — join, craft, and listen to the beats. Text chat stays quiet.",
    vibeMode: "force-mute",
    autoAudioVideo: false,
    forceMuteOnJoin: true,
    raiseHandToTalk: false,
    disableAudio: false,
  },
  {
    slug: "velvet-accent-den",
    name: "The Velvet Accent Den",
    description: "Calm, intimate, and supportive — like a coffee-shop corner. Mics welcome but voices stay soft for pattern help and gentle storytelling.",
    musicName: "Ambient drones & cinematic piano",
    vibe: "calm",
    color: "#701a75",
    rule: "Raise your hand to talk. This is the soft-spoken room — pattern help and gentle conversation only.",
    vibeMode: "raise-hand",
    autoAudioVideo: false,
    forceMuteOnJoin: false,
    raiseHandToTalk: true,
    disableAudio: false,
  },
  {
    slug: "silent-studio",
    name: "The Silent Studio",
    description: "Zero-distraction accountability zone. Cameras on for company, but absolute silence — bring your own focus soundtrack.",
    musicName: "",
    vibe: "silent",
    color: "#334155",
    rule: "Audio stays off — always. Just cameras and company for deep-focus crafting.",
    vibeMode: "silent",
    autoAudioVideo: false,
    forceMuteOnJoin: false,
    raiseHandToTalk: false,
    disableAudio: true,
  },
];

export async function seedAlwaysOnRooms() {
  try {
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
        if (data.color !== spec.color) patch.color = spec.color;
        for (const key of [
          "vibeMode",
          "rule",
          "autoAudioVideo",
          "forceMuteOnJoin",
          "raiseHandToTalk",
          "disableAudio",
        ]) {
          if (data[key] !== spec[key]) patch[key] = spec[key];
        }
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
        vibeMode: spec.vibeMode,
        rule: spec.rule,
        autoAudioVideo: spec.autoAudioVideo,
        forceMuteOnJoin: spec.forceMuteOnJoin,
        raiseHandToTalk: spec.raiseHandToTalk,
        disableAudio: spec.disableAudio,
        createdBy: "system",
        createdAt: new Date(),
      };
      await ref.set(room);
      created.push({ id: ref.id, slug: spec.slug, name: spec.name, alwaysOn: true });
    }
    return created;
  } catch {
    // Seeding is best-effort; the rooms page falls back to hardcoded lounges.
    return ALWAYS_ON_ROOMS.map((spec) => ({
      id: spec.slug,
      slug: spec.slug,
      name: spec.name,
      alwaysOn: true,
    }));
  }
}

export async function seedAlwaysOnRoom() {
  return seedAlwaysOnRooms();
}
