import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const AVATAR_MAX_BYTES = 4 * 1024 * 1024;
const COVER_MAX_BYTES = 8 * 1024 * 1024;
const PROJECT_MAX_BYTES = 10 * 1024 * 1024;

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
  const isMusic = kind === "music";
  const isProject = kind === "project";
  if (!isAvatar && !isCover && !isMusic && !isProject) {
    return NextResponse.json({ error: "Unknown upload kind" }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const maxBytes = isProject ? PROJECT_MAX_BYTES : isCover ? COVER_MAX_BYTES : AVATAR_MAX_BYTES;
  if ((isAvatar || isCover || isProject) && !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
  }
  if (file.size > maxBytes) {
    return NextResponse.json({ error: `File too large (max ${maxBytes / 1024 / 1024} MB)` }, { status: 400 });
  }

  if (isAvatar || isCover || isProject) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isSafeImage(file.type, bytes)) {
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

    const blob = await put(pathname, file, {
      access: "public",
      contentType: file.type || "application/octet-stream",
      addRandomSuffix: true,
    });

    return NextResponse.json({ url: blob.url });
  }

  return NextResponse.json({ error: "Unsupported upload kind" }, { status: 400 });
}

function isSafeImage(mime, bytes) {
  const sig = (expected, offset = 0) =>
    expected.every((b, i) => bytes.length > offset + i && bytes[offset + i] === b);
  if (mime === "image/png") return sig([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mime === "image/jpeg") return sig([0xff, 0xd8, 0xff]);
  if (mime === "image/gif") return sig([0x47, 0x49, 0x46, 0x38]);
  if (mime === "image/webp") return sig([0x52, 0x49, 0x46, 0x46]) && sig([0x57, 0x45, 0x42, 0x50], 8);
  if (mime === "image/avif") return sig([0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70]);
  // All other image/* types (including SVG, which can carry scripts) are rejected.
  return false;
}
