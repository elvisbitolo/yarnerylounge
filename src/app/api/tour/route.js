import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { logError } from "@/lib/server/log";
import { getPrisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  let extra = null;
  try {
    const row = await getPrisma().user.findUnique({
      where: { id: auth.user.uid },
      select: { extra: true },
    });
    extra = row?.extra || null;
  } catch (err) {
    logError("tour.read_failed", { error: err.message, uid: auth.user.uid });
  }
  const tours = (extra && extra.tours) || {};

  return NextResponse.json({
    dashboard: !!tours.dashboard?.completed,
  });
}

export async function POST(req) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { tour, completed } = await req.json();

  try {
    if (completed === true) {
      const prisma = getPrisma();
      const existing = await prisma.user.findUnique({
        where: { id: auth.user.uid },
        select: { extra: true },
      });
      const extra = { ...(existing?.extra || {}) };
      const tours = typeof extra.tours === "object" && extra.tours ? extra.tours : {};
      tours[tour] = { completed: true, at: new Date() };
      extra.tours = tours;
      await prisma.user.update({
        where: { id: auth.user.uid },
        data: { extra, updatedAt: new Date() },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("tour.update_prisma_failed", { error: err.message, uid: auth.user.uid });
    return NextResponse.json({ error: "Could not save tour state" }, { status: 500 });
  }
}
