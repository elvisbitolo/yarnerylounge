// Recording metadata updates (rename) and deletion.

import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { requireActiveMember } from "@/lib/server/authorize";

export const dynamic = "force-dynamic";

export async function PATCH(req, { params }) {
  const auth = await requireActiveMember();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const body = await req.json();
    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 200) : null;
    const prisma = getPrisma();
    const rec = await prisma.recording.findUnique({ where: { id } });
    if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const isOwner = auth.userDoc?.role === "owner";
    const isInitiator = rec.initiatorId && rec.initiatorId === auth.user.uid;
    if (!isOwner && !isInitiator) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });

    const updated = await prisma.recording.update({
      where: { id },
      data: { title },
    });
    return NextResponse.json({ ok: true, data: { id: updated.id, title: updated.title } });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const auth = await requireActiveMember();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const prisma = getPrisma();
    const rec = await prisma.recording.findUnique({ where: { id } });
    if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (rec.deletedAt) return NextResponse.json({ error: "Already deleted" }, { status: 400 });
    const isOwner = auth.userDoc?.role === "owner";
    const isInitiator = rec.initiatorId && rec.initiatorId === auth.user.uid;
    if (!isOwner && !isInitiator) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.recording.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: auth.user.uid },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
  }
}
