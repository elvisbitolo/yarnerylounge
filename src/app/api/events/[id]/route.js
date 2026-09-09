import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getEvent } from "@/lib/server/events";
import { canManageScope } from "@/lib/server/hosts";
import { logAudit } from "@/lib/server/audit";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function PATCH(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const event = await getEvent(id);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (!(await canManageScope(user.uid, "event", id))) {
    return NextResponse.json({ error: "Event host access required" }, { status: 403 });
  }
  const { publicPreview } = await req.json();
  if (typeof publicPreview !== "boolean") {
    return NextResponse.json({ error: "publicPreview must be a boolean" }, { status: 400 });
  }
  try {
    const prisma = getPrisma();
    await prisma.event.update({
      where: { id },
      data: { publicPreview },
    });
    await logAudit({
      actorId: user.uid,
      actorName: user.displayName || user.email || "",
      action: "event.updated",
      targetId: id,
      metadata: { publicPreview },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("event.update_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const event = await getEvent(id);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (!(await canManageScope(user.uid, "event", id))) {
    return NextResponse.json({ error: "Event host access required" }, { status: 403 });
  }
  try {
    const prisma = getPrisma();
    await prisma.event.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("event.delete_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
  }
}