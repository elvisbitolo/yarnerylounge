import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { requireUser, guardJson } from "@/lib/server/authorize";

export const dynamic = "force-dynamic";

const ACTION = "jitsi.network.sample";
const MIN_INTERVAL_MS = 10000;
const FIELDS = [
  "connectionQuality",
  "bandwidthDownload",
  "bandwidthUpload",
  "bitrateDownload",
  "bitrateUpload",
  "packetLossDownload",
  "packetLossUpload",
  "packetLossTotal",
  "rttMs",
  "maxEnabledResolution",
];

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(-1, Math.min(number, 100000000)) : null;
}

export async function POST(request) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const roomId = String(body?.roomId || "").trim().slice(0, 120);
  const roomName = String(body?.roomName || "").trim().slice(0, 120);
  const sessionId = String(body?.sessionId || "").trim().slice(0, 80);
  if (!roomId || !roomName || !sessionId) {
    return NextResponse.json({ error: "Missing session context" }, { status: 400 });
  }

  const metadata = {
    sessionId,
    roomId,
    roomName,
    sampledAt: new Date().toISOString(),
    iceConnected: typeof body.iceConnected === "boolean" ? body.iceConnected : null,
  };
  for (const field of FIELDS) metadata[field] = numberOrNull(body[field]);

  try {
    const prisma = getPrisma();
    if (!prisma) throw new Error("Database unavailable");

    const previous = await prisma.auditLog.findFirst({
      where: { actorId: auth.user.uid, action: ACTION },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (previous && Date.now() - previous.createdAt.getTime() < MIN_INTERVAL_MS) {
      return NextResponse.json({ ok: true, throttled: true });
    }

    await prisma.auditLog.create({
      data: {
        actorId: auth.user.uid,
        actorName: String(auth.user.name || "Member").slice(0, 100),
        action: ACTION,
        targetId: roomId,
        metadata,
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not store network sample" }, { status: 503 });
  }
}
