import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { logError } from "@/lib/server/log";
import { getPrisma } from "@/lib/db/prisma";

const DEFAULTS = {
  chat: true,
  feed: true,
  events: true,
  mentions: true,
  automations: true,
  watch: true,
  emailMessages: true,
  emailEvents: true,
  emailMatches: true,
  emailDigest: true,
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const prisma = getPrisma();
  let prefs = { ...DEFAULTS };
  try {
    const row = await prisma.user.findUnique({
      where: { id: user.uid },
      select: { notificationPreferences: true },
    });
    if (row?.notificationPreferences && typeof row.notificationPreferences === "object") {
      prefs = { ...prefs, ...row.notificationPreferences };
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

  const body = await req.json().catch(() => ({}));
  const prisma = getPrisma();
  let existing = {};
  try {
    const row = await prisma.user.findUnique({
      where: { id: user.uid },
      select: { notificationPreferences: true },
    });
    if (row?.notificationPreferences && typeof row.notificationPreferences === "object") {
      existing = row.notificationPreferences;
    }
  } catch (err) {
    logError("notifications.prisma_prefs_read_failed", { error: err.message });
    return NextResponse.json({ error: "Could not load preferences" }, { status: 503 });
  }

  // Preserve preferences owned by other features instead of wiping unknown keys.
  const prefs = { ...DEFAULTS, ...existing };
  for (const key of Object.keys(DEFAULTS)) {
    if (typeof body[key] === "boolean") prefs[key] = body[key];
  }

  try {
    await prisma.user.upsert({
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
