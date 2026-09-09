import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { ALWAYS_ON_ROOMS } from "@/lib/server/rooms";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export const dynamic = "force-dynamic";

const DEFAULT_ROOM_SLUG = ALWAYS_ON_ROOMS[0].slug;

export async function GET(req) {
  const url = new URL(req.url);
  const roomSlug = url.searchParams.get("room") || DEFAULT_ROOM_SLUG;
  try {
    const prisma = getPrisma();
    const row = await prisma.room.findUnique({ where: { slug: roomSlug } });
    if (!row) return NextResponse.json({ music: null });
    return NextResponse.json({
      roomSlug,
      music: row.musicUrl || null,
      musicFileId: row.musicFileId || null,
      musicName: row.musicName || null,
      musicPlaying: !!row.musicPlaying,
    });
  } catch (err) {
    logError("room.music.read_failed", { error: err.message });
    return NextResponse.json({ music: null });
  }
}

export async function POST(req) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { roomSlug, musicUrl, musicFileId, musicName, musicPlaying } = await req.json();
  const slug = typeof roomSlug === "string" && roomSlug ? roomSlug : DEFAULT_ROOM_SLUG;

  try {
    const prisma = getPrisma();
    const row = await prisma.room.findUnique({ where: { slug } });
    if (!row) return NextResponse.json({ error: "Room not found" }, { status: 404 });

    await prisma.room.update({
      where: { slug },
      data: {
        ...(typeof musicName === "string" && { musicName }),
        ...(typeof musicUrl === "string" && { musicUrl }),
        ...(typeof musicFileId === "string" && { musicFileId }),
        ...(typeof musicPlaying === "boolean" && { musicPlaying }),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("room.music.update_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to update music" }, { status: 500 });
  }
}