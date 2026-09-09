import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { logError } from "@/lib/server/log";
import { getPrisma } from "@/lib/db/prisma";

export async function GET(req, { params }) {
  const { id } = await params;
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  try {
    const prisma = getPrisma();
    const row = await prisma.challenge.findUnique({ where: { id } });
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const now = new Date();
    const end = row.endDate ? new Date(row.endDate) : new Date(undefined);
    const start = row.startDate ? new Date(row.startDate) : new Date(undefined);
    let status = "upcoming";
    if (now >= start && now <= end) status = "active";
    if (now > end) status = "completed";

    const participantsRows = await prisma.challengeParticipant.findMany({
      where: { challengeId: id },
      orderBy: { progress: "desc" },
      take: 50,
    });
    const participants = participantsRows.map((p) => ({
      userId: p.userId,
      userName: p.userName,
      progress: p.progress || 0,
      joinedAt: p.joinedAt ? new Date(p.joinedAt).getTime() : 0,
    }));
    const myPart = participants.find((p) => p.userId === auth.user.uid);

    return NextResponse.json({
      challenge: {
        id: row.id,
        title: row.title,
        description: row.description,
        emoji: row.emoji,
        goal: row.goal,
        startDate: start.getTime(),
        endDate: end.getTime(),
        status,
      },
      participants,
      myProgress: myPart?.progress || 0,
      joined: !!myPart,
    });
  } catch (err) {
    logError("challenges.get.prisma_read_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to load challenge" }, { status: 500 });
  }
}

export async function POST(req, { params }) {
  const { id } = await params;
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  try {
    const prisma = getPrisma();
    const challengeRow = await prisma.challenge.findUnique({ where: { id } });
    if (!challengeRow) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const existing = await prisma.challengeParticipant.findUnique({
      where: { id: `${id}_${auth.user.uid}` },
    });
    if (existing) {
      return NextResponse.json({ error: "Already joined" }, { status: 400 });
    }
    try {
      await prisma.challengeParticipant.create({
        data: {
          id: `${id}_${auth.user.uid}`,
          challengeId: id,
          userId: auth.user.uid,
          userName: auth.userDoc?.name || "Member",
          progress: 0,
        },
      });
      await prisma.challenge.update({
        where: { id },
        data: { participantCount: { increment: 1 } },
      });
    } catch (err) {
      logError("challenge.join_failed", { error: err.message, uid: auth.user.uid, id });
      return NextResponse.json({ error: "Could not join challenge" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("challenge.join.prisma_failed", { error: err.message, uid: auth.user.uid, id });
    return NextResponse.json({ error: "Could not join challenge" }, { status: 500 });
  }
}

export async function PATCH(req, { params }) {
  const { id } = await params;
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { progress } = await req.json();
  const target = Math.max(0, Math.floor(Number(progress) || 0));

  let justCompleted = false;
  let challengeTitle = "challenge";
  try {
    const prisma = getPrisma();
    await prisma.$transaction(async (tx) => {
      const part = await tx.challengeParticipant.findUnique({
        where: { id: `${id}_${auth.user.uid}` },
      });
      if (!part) {
        throw new Error("not-joined");
      }
      const current = part.progress || 0;
      const next = Math.max(current, target);
      await tx.challengeParticipant.update({
        where: { id: `${id}_${auth.user.uid}` },
        data: { progress: next },
      });
      if (current < target) {
        const challengeRow = await tx.challenge.findUnique({ where: { id } });
        if (challengeRow) {
          const goal = challengeRow.goal || 10;
          if (challengeRow.title) challengeTitle = challengeRow.title;
          if (current < goal && next >= goal) justCompleted = true;
        }
      }
    });
  } catch (err) {
    if (err.message === "not-joined") {
      return NextResponse.json({ error: "Join this challenge first" }, { status: 400 });
    }
    logError("challenge.progress_failed", { error: err.message, uid: auth.user.uid, id });
    return NextResponse.json({ error: "Could not update progress" }, { status: 500 });
  }

  if (justCompleted) {
    const { createNotification } = await import("@/lib/server/notifications");
    await createNotification({
      userId: auth.user.uid,
      type: "system",
      actorId: "system",
      actorName: "Secret Yarnery",
      href: `/challenges`,
      text: `You completed the "${challengeTitle}" challenge! 🎉`,
    }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}