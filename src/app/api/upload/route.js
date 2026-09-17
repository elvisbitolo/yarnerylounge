import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const AVATAR_MAX_BYTES = 4 * 1024 * 1024;
const COVER_MAX_BYTES = 8 * 1024 * 1024;
const PROJECT_MAX_BYTES = 10 * 1024 * 1024;
const CHAT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const CHAT_FILE_MAX_BYTES = 10 * 1024 * 1024;

const CHAT_FILE_MIME = new Set([
  "application/octet-stream",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/gzip",
  "application/json",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "video/mp4",
  "video/webm",
]);

export async function POST(req) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`upload:${auth.user.uid}`, { limit: 20 });
  if (limited) return limited;

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const isAvatar = kind === "avatar";
  const isCover = kind === "cover";
  const isProject = kind === "project";
  const isChat = kind === "chat";
  if (!isAvatar && !isCover && !isProject && !isChat) {
    return NextResponse.json({ error: "Unknown upload kind" }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const isChatImage = isChat && file.type.startsWith("image/");
  const maxBytes = isProject
    ? PROJECT_MAX_BYTES
    : isCover
      ? COVER_MAX_BYTES
      : isAvatar
        ? AVATAR_MAX_BYTES
        : isChatImage
          ? CHAT_IMAGE_MAX_BYTES
          : CHAT_FILE_MAX_BYTES;

  if (isChatImage) {
    if (file.size > CHAT_IMAGE_MAX_BYTES) {
      return NextResponse.json({ error: `Image too large (max 8 MB)` }, { status: 400 });
    }
  } else if (isChat) {
    if (!CHAT_FILE_MIME.has(file.type || "application/octet-stream")) {
      return NextResponse.json({ error: "That file type isn't allowed yet" }, { status: 400 });
    }
    if (file.size > CHAT_FILE_MAX_BYTES) {
      return NextResponse.json({ error: `File too large (max 10 MB)` }, { status: 400 });
    }
  } else if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
  }
  if (file.size > maxBytes) {
    return NextResponse.json({ error: `File too large (max ${maxBytes / 1024 / 1024} MB)` }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.type.startsWith("image/") && !isSafeImage(file.type, bytes)) {
    return NextResponse.json({ error: "Image file could not be verified" }, { status: 400 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    const mime = file.type || "application/octet-stream";
    const dataUrl = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
    return NextResponse.json({ dataUrl });
  }

  const { put } = await import("@vercel/blob");
  let ext = (file.name || "").split(".").pop() || "bin";
  ext = (ext.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin").toLowerCase();
  const pathname = `uploads/${kind}/${auth.user.uid}/${Date.now()}.${ext}`;
  const freshBlob = new Blob([bytes], { type: file.type || "application/octet-stream" });

  const blob = await put(pathname, freshBlob, {
    access: "public",
    contentType: file.type || "application/octet-stream",
    addRandomSuffix: true,
  });

  return NextResponse.json({ url: blob.url });
}

export async function DELETE(req) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`upload-delete:${auth.user.uid}`, { limit: 40 });
  if (limited) return limited;

  let url = "";
  try {
    const body = await req.json();
    url = typeof body?.url === "string" ? body.url : "";
  } catch {
    /* no body */
  }

  // Only allow deleting an avatar blob the caller owns. The upload route
  // writes to uploads/avatar/<uid>/..., so the uid is part of the path.
  const marker = `/uploads/avatar/${auth.user.uid}/`;
  if (
    !/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i.test(url) ||
    !url.includes(marker)
  ) {
    return NextResponse.json({ error: "Not an owned avatar blob" }, { status: 400 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ ok: true });
  }

  const { del } = await import("@vercel/blob");
  try {
    await del(url);
  } catch {
    return NextResponse.json({ error: "Failed to delete blob" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}

function isSafeImage(mime, bytes) {
  const sig = (expected, offset = 0) =>
    expected.every((b, i) => bytes.length > offset + i && bytes[offset + i] === b);
  if (mime === "image/png") return sig([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mime === "image/jpeg") return sig([0xff, 0xd8, 0xff]);
  if (mime === "image/gif") return sig([0x47, 0x49, 0x46, 0x38]);
  if (mime === "image/webp") return sig([0x52, 0x49, 0x46, 0x46]) && sig([0x57, 0x45, 0x42, 0x50], 8);
  if (mime === "image/avif") {
    // AVIF: any ftyp box size, brands "avif"/"avis" at offsets 8-11 (mihe/mif1
    // also appear in some encoders as a secondary brand).
    return (
      sig([0x66, 0x74, 0x79, 0x70], 4) &&
      (sig([0x61, 0x76, 0x69, 0x66], 8) || sig([0x61, 0x76, 0x69, 0x73], 8))
    );
  }
  // All other image/* types (including SVG, which can carry scripts) are rejected.
  return false;
}
