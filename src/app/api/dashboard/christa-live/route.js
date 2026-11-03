import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

const OWNER_EMAIL = "secretyarnery@gmail.com";
const PRESENCE_WINDOW_MS = 90_000;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ live: null }, { status: 401 });

  const userDoc = await getUserDoc(user.uid);
  const viewerEmail = String(userDoc?.email || user.email || "").trim().toLowerCase();
  if (viewerEmail === OWNER_EMAIL) return NextResponse.json({ live: null });

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ live: null });

  try {
    const owner = await prisma.user.findFirst({
      where: { email: { equals: OWNER_EMAIL, mode: "insensitive" } },
      select: { id: true, name: true },
    });
    if (!owner) return NextResponse.json({ live: null });

    const presence = await prisma.roomPresence.findFirst({
      where: {
        userId: owner.id,
        leftAt: null,
        lastSeenAt: { gt: new Date(Date.now() - PRESENCE_WINDOW_MS) },
        room: { status: "active" },
      },
      orderBy: { lastSeenAt: "desc" },
      select: { roomId: true },
    });
    if (!presence) return NextResponse.json({ live: null });

    const room = await prisma.room.findUnique({
      where: { id: presence.roomId },
      select: { name: true, slug: true, status: true },
    });
    if (!room || room.status !== "active" || !room.slug) {
      return NextResponse.json({ live: null });
    }

    return NextResponse.json({
      live: {
        hostName: owner.name || "Christa",
        roomName: room.name,
        roomSlug: room.slug,
      },
    });
  } catch (error) {
    console.error("dashboard.christa_live_failed", error);
    return NextResponse.json({ live: null });
  }
}
