import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { mapRoomRow } from "./rooms-core.js";

export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function listRooms() {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.room.findMany({ orderBy: { createdAt: "desc" } });
      return rows.map(mapRoomRow);
    } catch (err) {
      logError("rooms.prisma_list_failed", { error: err.message });
    }
  }
  return ALWAYS_ON_ROOMS.map(canonicalDefaultRoom);
}

export async function listRoomsForGroup(groupId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.room.findMany({ where: { groupId } });
      return rows
        .map(mapRoomRow)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    } catch (err) {
      logError("rooms.prisma_list_group_failed", { error: err.message });
    }
  }
  return [];
}

export async function getRoom(id) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.room.findUnique({ where: { id } });
      return row ? mapRoomRow(row) : null;
    } catch (err) {
      logError("rooms.prisma_get_failed", { error: err.message });
    }
  }
  return null;
}

export async function getRoomBySlug(slug) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.room.findUnique({ where: { slug } });
      if (row) return mapRoomRow(row);
    } catch (err) {
      logError("rooms.prisma_getBySlug_failed", { error: err.message });
    }
  }
  const spec = ALWAYS_ON_ROOMS.find((r) => r.slug === slug);
  return spec ? canonicalDefaultRoom(spec) : null;
}

// Lobby read: returns all rooms, seeding the canonical always-on rooms first
// only when one is missing from the database. In the steady state (all four
// present) this is a single findMany, so there is no per-request write/sync pass.
// Only persisted rows are treated as "present" — the in-memory canonical
// fallback must never disguise a missing DB row, or seeding would be skipped
// forever and every DB-backed room feature (chat, signals, presence, join
// events) would 404.
export async function listRoomsEnsuringAlwaysOn() {
  const rooms = await listRooms();
  const present = new Set(rooms.filter((room) => room.persisted).map((room) => room.slug));
  const missing = ALWAYS_ON_ROOMS.filter((spec) => !present.has(spec.slug));
  if (missing.length === 0) return rooms;
  await seedAlwaysOnRooms();
  return listRooms();
}

// Detail read: seeds on demand only when a canonical always-on room is absent,
// so the join page never pays for the sync pass on the happy path. Missing
// non-canonical slugs return null (callers render "not found"). A fallback
// (in-memory, persisted:false) is never treated as "present" — the canonical
// slug is seeded into Postgres so DB-backed behaviour (join events, presence,
// the larger participant cap) works for concurrent members.
export async function getRoomBySlugEnsuringAlwaysOn(slug) {
  const room = await getRoomBySlug(slug);
  if (room?.persisted) return room;
  if (ALWAYS_ON_ROOMS.some((spec) => spec.slug === slug)) {
    await seedAlwaysOnRooms();
    return getRoomBySlug(slug);
  }
  return null;
}

// Room resolver for the DB-backed room APIs (chat, signals, presence, join
// events). Resolves by id or slug against the Room table, and when the key is
// a canonical always-on lounge that has no row yet it seeds the canonical rooms
// first so the API never 404s a lounge that should exist. Returns null for
// genuinely unknown or non-active rooms (callers render "not found").
export async function getActiveRoomEnsuring(roomKey) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row =
        (await prisma.room.findUnique({ where: { id: roomKey } })) ||
        (await prisma.room.findUnique({ where: { slug: roomKey } }));
      if (row && (row.status || "active") === "active") return row;
      if (row) return null;
      if (ALWAYS_ON_ROOMS.some((spec) => spec.slug === roomKey)) {
        await seedAlwaysOnRooms();
        const seeded = await prisma.room.findUnique({ where: { slug: roomKey } });
        if (seeded && (seeded.status || "active") === "active") return seeded;
        return null;
      }
    } catch (err) {
      logError("rooms.prisma_active_ensure_failed", { error: err.message });
    }
  }
  return null;
}

function canonicalDefaultRoom(spec) {
  return {
    id: spec.slug,
    persisted: false,
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
    imageUrl: spec.imageUrl || "",
    createdBy: "",
    maxParticipants: 20,
    opensAt: null,
    createdAt: new Date(0),
  };
}

export async function createRoom({ name, description, maxParticipants, groupId, spaceId, kind, publicPreview, createdBy, opensAt }) {
  const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
  const prisma = getPrisma();
  if (prisma) {
    try {
      const created = await prisma.room.create({
        data: {
          name,
          slug,
          description: description || "",
          status: "active",
          maxParticipants: maxParticipants || 20,
          groupId: groupId || null,
          spaceId: spaceId || null,
          kind: kind === "broadcast" ? "broadcast" : "standard",
          publicPreview: !!publicPreview,
          opensAt: opensAt ? new Date(opensAt) : null,
          createdBy,
        },
      });
      return { id: created.id, slug, name, description };
    } catch (err) {
      logError("rooms.prisma_create_failed", { error: err.message });
    }
  }
  return { id: "", slug, name, description };
}

export async function deleteRoom(room) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.roomEvent.deleteMany({ where: { roomId: room.id } });
        await tx.roomSignal.deleteMany({ where: { roomId: room.id } });
        await tx.roomMessage.deleteMany({ where: { roomId: room.id } });
        await tx.room.deleteMany({ where: { id: room.id } });
      });
      return;
    } catch (err) {
      logError("rooms.prisma_delete_failed", { error: err.message });
    }
  }
}

export const ALWAYS_ON_ROOMS = [
  {
    slug: "happy-hour-hub",
    name: "Happy Hour Hub",
    description:
      "High-energy, loud, and chatty. Our official welcome mat! Hop in, flip your camera on, show off your latest yarn haul, and make fast friends. Upbeat, vocal-free background grooves stream here 24/7.",
    musicName: "Upbeat lounge grooves",
    vibe: "social",
    color: "#e91e63",
    rule: "Cameras and mics on. Kick back, sip something nice, and enjoy the company.",
    vibeMode: "auto",
    autoAudioVideo: true,
    forceMuteOnJoin: false,
    raiseHandToTalk: false,
    disableAudio: false,
    imageUrl: "/images/rooms/happy-hour-hub-v2.jpg",
  },
  {
    slug: "lo-fi-and-loops",
    name: "Lo-Fi & Loops",
    description:
      "Focused creative flow. Perfect for introverted crafting. Microphones stay muted by default while smooth, relaxing lo-fi hip-hop tracks stream continuously to keep you in your zone.",
    musicName: "Cozy lo-fi hip-hop beats",
    vibe: "focus",
    color: "#2dd4bf",
    rule: "Mics start muted. Craft, focus, and listen to the beats. Text chat stays quiet.",
    vibeMode: "force-mute",
    autoAudioVideo: false,
    forceMuteOnJoin: true,
    raiseHandToTalk: false,
    disableAudio: false,
    imageUrl: "/images/rooms/lofi-and-loops.jpg",
  },
  {
    slug: "velvet-den",
    name: "The Velvet Den",
    description:
      "Calm, cozy comfort. This is your designated Pattern Help Hub—hold your work up to the camera and troubleshoot tricky rows together. We are streaming relaxing ambient drone, cinematic piano, and soft environmental soundscapes here 24/7.",
    musicName: "Ambient drones & cinematic piano",
    vibe: "calm",
    color: "#701a75",
    rule: "Raise your hand to talk. This is the soft-spoken room — pattern help and gentle conversation only.",
    vibeMode: "raise-hand",
    autoAudioVideo: false,
    forceMuteOnJoin: false,
    raiseHandToTalk: true,
    disableAudio: false,
    imageUrl: "/images/rooms/velvet-den.jpg",
  },
  {
    slug: "silent-studio",
    name: "The Silent Studio",
    description:
      "Pure visual accountability. Absolutely no music or chatter allowed. Log in, keep your mic muted, and enjoy parallel crafting while listening to your own TV show or audiobook.",
    musicName: "",
    vibe: "silent",
    color: "#334155",
    rule: "Audio stays off — always. Just cameras and company for deep-focus crafting.",
    vibeMode: "silent",
    autoAudioVideo: false,
    forceMuteOnJoin: false,
    raiseHandToTalk: false,
    disableAudio: true,
    imageUrl: "/images/rooms/silent-studio.jpg",
  },
];

export async function seedAlwaysOnRooms() {
  const prisma = getPrisma();
  try {
    // Room.creator is a required User relation — the seeded rooms must point
    // at a real member. Prefer an owner, then a moderator, then any member,
    // so a fresh database never fails to seed the canonical lounges.
    const createdBy = await resolveSeedCreatorId(prisma);
    const created = [];
    for (const spec of ALWAYS_ON_ROOMS) {
      if (prisma) {
        try {
          const existing = await prisma.room.findFirst({ where: { slug: spec.slug } });
          if (existing) {
            const patch = { alwaysOn: true };
            if (existing.name !== spec.name) patch.name = spec.name;
            if (existing.description !== spec.description) patch.description = spec.description;
            if (existing.color !== spec.color) patch.color = spec.color;
            if (existing.imageUrl !== spec.imageUrl) patch.imageUrl = spec.imageUrl;
            for (const key of [
              "vibeMode",
              "rule",
              "autoAudioVideo",
              "forceMuteOnJoin",
              "raiseHandToTalk",
              "disableAudio",
            ]) {
              if (existing[key] !== spec[key]) patch[key] = spec[key];
            }
            if (Object.keys(patch).length > 1) {
              await prisma.room.update({ where: { id: existing.id }, data: patch });
            }
            created.push({ id: existing.id, slug: spec.slug, name: spec.name, alwaysOn: true });
            continue;
          }
          const room = await prisma.room.create({
            data: {
              name: spec.name,
              slug: spec.slug,
              description: spec.description,
              status: "active",
              maxParticipants: 200,
              groupId: null,
              spaceId: null,
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
              imageUrl: spec.imageUrl,
              createdBy,
            },
          });
          created.push({ id: room.id, slug: spec.slug, name: spec.name, alwaysOn: true });
          continue;
        } catch (err) {
          logError("rooms.prisma_seed_failed", { error: err.message, slug: spec.slug });
        }
      }
    }
    return created;
  } catch {
    return ALWAYS_ON_ROOMS.map((spec) => ({
      id: spec.slug,
      persisted: false,
      slug: spec.slug,
      name: spec.name,
      alwaysOn: true,
    }));
  }
}

async function resolveSeedCreatorId(prisma) {
  if (!prisma) return "";
  try {
    for (const role of ["owner", "moderator"]) {
      const user = await prisma.user.findFirst({
        where: { role },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (user?.id) return user.id;
    }
    const anyUser = await prisma.user.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    return anyUser?.id || "";
  } catch {
    return "";
  }
}

export async function seedAlwaysOnRoom() {
  return seedAlwaysOnRooms();
}
