import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ALLOWED_AUDIO = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/aac",
  "audio/x-m4a",
  "audio/mp4",
  "audio/flac",
]);

export async function POST(req) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > 700 * 1024) {
    return NextResponse.json({ error: "File too large (max 700KB)" }, { status: 400 });
  }

  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED_AUDIO.has(mime)) {
    return NextResponse.json({ error: "Only audio files are allowed" }, { status: 415 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = Array.from(bytes.slice(0, 12)).map((b) => b.toString(16).padStart(2, "0")).join(" ");
  if (!looksLikeAudio(mime, signature)) {
    return NextResponse.json({ error: "File content does not match an audio format" }, { status: 415 });
  }

  const base64 = Buffer.from(bytes).toString("base64");
  if (base64.length > 900 * 1024) {
    return NextResponse.json({ error: "Audio too large to store" }, { status: 400 });
  }
  const dataUrl = `data:${mime};base64,${base64}`;

  try {
    const prisma = getPrisma();
    const created = await prisma.musicFile.create({
      data: {
        dataUrl,
        name: file.name,
        mimeType: mime,
        size: file.size,
        uploadedBy: auth.user.uid,
      },
    });
    return NextResponse.json({ id: created.id, dataUrl });
  } catch (err) {
    logError("room.music_upload_failed", { error: err.message });
    return NextResponse.json({ error: "Could not save audio" }, { status: 500 });
  }
}

function looksLikeAudio(mime, hexSig) {
  // MP3 (ID3) or MP3 frame header
  if (/audio\/mpe?g/.test(mime)) return /^49 44 33|^ff fb|^ff f3|^ff f2|^ff fa|^49 44 33/.test(hexSig);
  // WAV/RIFF
  if (/audio\/(x-)?wav/.test(mime)) return /^52 49 46 46/.test(hexSig);
  // Ogg
  if (/audio\/ogg/.test(mime)) return /^4f 67 67 53/.test(hexSig);
  // M4A/MP4 (ftyp box variant)
  if (/audio\/(mp4|x-m4a|aac)/.test(mime)) return /^00 00 00.*66 74 79 70/.test(hexSig);
  // FLAC (fLaC)
  if (/audio\/flac/.test(mime)) return /^66 4c 61 43/.test(hexSig);
  if (/audio\/aac/.test(mime)) return /^ff f1|^ff f9/.test(hexSig);
  return true;
}