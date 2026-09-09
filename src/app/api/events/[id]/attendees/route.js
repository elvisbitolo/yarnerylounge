import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getAccessSub, isActiveSub } from "@/lib/server/subscription";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function GET(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const sub = await getAccessSub(user.uid);
  if (!isActiveSub(sub)) {
    return NextResponse.json({ error: "Active membership required" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const occurrenceId = searchParams.get("occurrenceId") || "";

  try {
    const prisma = getPrisma();
    const row = await prisma.event.findUnique({ where: { id } });
    if (!row) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const rows = await prisma.rsvp.findMany({
      where: { eventId: id, ...(occurrenceId ? { occurrenceId } : {}) },
    });
    const attendees = rows.map((r) => ({ userId: r.userId, name: r.name || "" }));
    const names = attendees.map((a) => a.name || "Member").slice(0, 6);
    return NextResponse.json({
      count: attendees.length,
      names,
      mine: attendees.some((a) => a.userId === user.uid),
    });
  } catch (err) {
    logError("events.prisma_attendees_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to load attendees" }, { status: 500 });
  }
}