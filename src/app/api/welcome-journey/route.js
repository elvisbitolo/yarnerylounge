import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    const prisma = getPrisma();
    const member = await prisma.user.findUnique({
      where: { id: user.uid },
      select: { id: true, extra: true, username: true, name: true },
    });
    if (!member) return NextResponse.json({ error: "Member profile not found" }, { status: 404 });
    if (!member.username || !member.name) {
      return NextResponse.json({ error: "Add your name and choose a username before continuing." }, { status: 400 });
    }

    const extra = { ...(member.extra && typeof member.extra === "object" ? member.extra : {}) };
    extra.welcomeJourneyPending = false;
    extra.welcomeJourneyCompletedAt = new Date().toISOString();
    await prisma.user.update({
      where: { id: user.uid },
      data: { extra, updatedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("welcome_journey.complete_failed", { uid: user.uid, error: err.message });
    return NextResponse.json({ error: "Could not finish your welcome journey" }, { status: 500 });
  }
}
