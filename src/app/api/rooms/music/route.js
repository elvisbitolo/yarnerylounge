import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { adminDb } from "@/lib/firebase/admin";
import { ALWAYS_ON_ROOMS } from "@/lib/server/rooms";

export const dynamic = "force-dynamic";

const DEFAULT_ROOM_SLUG = ALWAYS_ON_ROOMS[0].slug;

async function findRoom(slug) {
  const snap = await adminDb()
    .collection("rooms")
    .where("slug", "==", slug)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0];
}

export async function GET(req) {
  const url = new URL(req.url);
  const roomSlug = url.searchParams.get("room") || DEFAULT_ROOM_SLUG;
  const room = await findRoom(roomSlug);
  if (!room) return NextResponse.json({ music: null });
  const data = room.data();
  return NextResponse.json({
    roomSlug,
    music: data.musicUrl || null,
    musicFileId: data.musicFileId || null,
    musicName: data.musicName || null,
    musicPlaying: !!data.musicPlaying,
  });
}

export async function POST(req) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { roomSlug, musicUrl, musicFileId, musicName, musicPlaying } = await req.json();
  const slug = typeof roomSlug === "string" && roomSlug ? roomSlug : DEFAULT_ROOM_SLUG;
  const room = await findRoom(slug);
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const update = {};
  if (typeof musicName === "string") update.musicName = musicName;
  if (typeof musicUrl === "string") update.musicUrl = musicUrl;
  if (typeof musicFileId === "string") update.musicFileId = musicFileId;
  if (typeof musicPlaying === "boolean") update.musicPlaying = musicPlaying;

  await room.ref.set(update, { merge: true });
  return NextResponse.json({ ok: true });
}