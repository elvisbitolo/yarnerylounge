import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getEvent } from "@/lib/server/events";
import { canManageScope } from "@/lib/server/hosts";
import { logAudit } from "@/lib/server/audit";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { updateContent } from "@/lib/server/admin-content";

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
  // Hosts keep their existing scope access; the fields themselves are limited to
  // the shared allow list so a host request cannot write unrelated columns.
  const result = await updateContent("event", id, await req.json().catch(() => null), {
    ...user,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, changed: result.changed });
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