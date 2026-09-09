import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { logError } from "@/lib/server/log";
import { getPrisma } from "@/lib/db/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const prisma = getPrisma();
  let prefs = {
    chat: true,
    feed: true,
    events: true,
    mentions: true,
    automations: true,
  };
  try {
    const row = await prisma.user.findUnique({
      where: { id: user.uid },
      select: { notificationPreferences: true },
    });
    if (row && row.notificationPreferences) {
      prefs = row.notificationPreferences;
    }
  } catch (err) {
    logError("notifications.prisma_prefs_read_failed", { error: err.message });
  }

  return NextResponse.json(prefs);
}

export async function PUT(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await req.json();
  const prefs = {
    chat: !!body.chat,
    feed: !!body.feed,
    events: !!body.events,
    mentions: !!body.mentions,
    automations: !!body.automations,
  };

  try {
    await getPrisma().user.upsert({
      where: { id: user.uid },
      create: {
        id: user.uid,
        name: user.displayName || "",
        notificationPreferences: prefs,
        updatedAt: new Date(),
      },
      update: {
        notificationPreferences: prefs,
        updatedAt: new Date(),
      },
    });
  } catch (err) {
    logError("prefs.update_failed", { error: err.message, uid: user.uid });
    return NextResponse.json({ error: "Could not save preferences" }, { status: 500 });
  }

  return NextResponse.json(prefs);
}
