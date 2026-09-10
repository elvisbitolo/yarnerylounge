import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { rateLimitGuard } from "@/lib/server/rate-limit";

const PRESENCE_WINDOW_MS = 90_000;

function parseIds(value) {
  return [...new Set(String(value || "").split(",").map((id) => id.trim()).filter(Boolean))].slice(0, 50);
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = rateLimitGuard(`presence-write:${user.uid}`, { limit: 6, windowMs: 60_000 });
  if (limited) return limited;

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ ok: true });

  try {
    const row = await prisma.user.findUnique({ where: { id: user.uid }, select: { extra: true } });
    const extra = row?.extra && typeof row.extra === "object" ? row.extra : {};
    await prisma.user.update({
      where: { id: user.uid },
      data: { extra: { ...extra, lastActiveAt: new Date().toISOString() }, updatedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("presence.heartbeat_failed", { error: err.message });
    return NextResponse.json({ error: "Presence unavailable" }, { status: 503 });
  }
}

export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = rateLimitGuard(`presence-read:${user.uid}`, { limit: 8, windowMs: 60_000 });
  if (limited) return limited;

  const ids = parseIds(new URL(req.url).searchParams.get("ids"));
  if (!ids.length) return NextResponse.json({ presence: {} });

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ presence: {} });

  try {
    const rows = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, extra: true } });
    const now = Date.now();
    const presence = Object.fromEntries(rows.map((row) => {
      const timestamp = Date.parse(typeof row.extra?.lastActiveAt === "string" ? row.extra.lastActiveAt : "");
      return [row.id, { online: Number.isFinite(timestamp) && now - timestamp <= PRESENCE_WINDOW_MS }];
    }));
    return NextResponse.json({ presence });
  } catch (err) {
    logError("presence.read_failed", { error: err.message });
    return NextResponse.json({ error: "Presence unavailable" }, { status: 503 });
  }
}
