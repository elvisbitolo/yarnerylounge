import { NextResponse } from "next/server";
import { requireUser, requireModerator, guardJson } from "@/lib/server/authorize";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function GET() {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  try {
    const prisma = getPrisma();
    const rows = await prisma.challenge.findMany({
      orderBy: { startDate: "desc" },
      take: 50,
    });

    const now = new Date();
    const challenges = rows.map((row) => {
      const end = row.endDate ? new Date(row.endDate) : new Date(undefined);
      const start = row.startDate ? new Date(row.startDate) : new Date(undefined);
      let status = "upcoming";
      if (now >= start && now <= end) status = "active";
      if (now > end) status = "completed";

      return {
        id: row.id,
        title: row.title || "",
        description: row.description || "",
        emoji: row.emoji || "🏆",
        goal: row.goal || 10,
        startDate: start.getTime(),
        endDate: end.getTime(),
        status,
        participantCount: row.participantCount || 0,
      };
    });

    return NextResponse.json({ challenges });
  } catch (err) {
    logError("challenges.prisma_list_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to load challenges" }, { status: 500 });
  }
}

export async function POST(req) {
  const auth = await requireModerator();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { title, description, emoji, goal, startDate, endDate } = await req.json();

  if (!title || !endDate) {
    return NextResponse.json({ error: "Title and end date required" }, { status: 400 });
  }

  try {
    const prisma = getPrisma();
    const challenge = await prisma.challenge.create({
      data: {
        title: title.trim(),
        description: (description || "").trim(),
        emoji: emoji || "🏆",
        goal: Math.max(1, parseInt(goal, 10) || 10),
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: new Date(endDate),
        participantCount: 0,
        createdBy: auth.user.uid,
      },
    });
    return NextResponse.json({ ok: true, id: challenge.id });
  } catch (err) {
    logError("challenges.prisma_create_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }
}