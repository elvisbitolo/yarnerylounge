import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

// Loopback, private, link-local and CGNAT ranges plus IPv6 loopback/ULA/link-local.
const PRIVATE_HOST_RE =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\.|0\.)/;

function isBlockedHost(hostname) {
  const host = String(hostname).toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return PRIVATE_HOST_RE.test(host);
  }
  if (/^[0-9a-f:]+$/.test(host) && host.includes(":")) {
    return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80");
  }
  return false;
}

// Fetches another avatar source (Vercel Blob, Google/GitHub OAuth pictures,
// inline data URLs) server-side and returns it as a data URL. The browser CSP
// connect-src only allows same-origin calls, so member avatars hosted elsewhere
// can't be pulled with fetch() directly on the client.
export async function POST(req) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`avatar-source:${auth.user.uid}`, { limit: 30 });
  if (limited) return limited;

  let url = "";
  try {
    const body = await req.json();
    url = typeof body?.url === "string" ? body.url.trim() : "";
  } catch {
    /* no body */
  }
  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  // Inline data-URL avatars (uploaded without a Blob token) pass straight through.
  if (/^data:image\//i.test(url)) {
    if (url.length > MAX_SOURCE_BYTES * 1.4) {
      return NextResponse.json({ error: "Photo too large to re-crop" }, { status: 413 });
    }
    return NextResponse.json({ dataUrl: url });
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid photo URL" }, { status: 400 });
  }
  if (parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Only https photo URLs are allowed" }, { status: 400 });
  }
  if (isBlockedHost(parsed.hostname)) {
    return NextResponse.json({ error: "That photo source isn't allowed" }, { status: 400 });
  }

  let res;
  try {
    res = await fetch(parsed, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    return NextResponse.json({ error: "Couldn't load your photo" }, { status: 502 });
  }
  if (!res.ok) {
    return NextResponse.json({ error: "Couldn't load your photo" }, { status: 502 });
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "The photo URL isn't an image" }, { status: 415 });
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) {
    return NextResponse.json({ error: "Empty photo" }, { status: 502 });
  }
  if (buf.length > MAX_SOURCE_BYTES) {
    return NextResponse.json({ error: "Photo too large to re-crop" }, { status: 413 });
  }

  return NextResponse.json({
    dataUrl: `data:${contentType};base64,${buf.toString("base64")}`,
  });
}