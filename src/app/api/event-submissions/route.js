import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { requireActiveMember, requireUser, guardJson } from "@/lib/server/authorize";
import { canModerate } from "@/lib/server/auth";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { clean } from "@/lib/server/validate";
import { logAudit } from "@/lib/server/audit";

export async function GET() {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;
  if (!canModerate(auth.userDoc)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const submissions = await prisma.eventSubmission.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: { user: { select: { id: true, name: true, email: true, photoURL: true, plan: true } } },
  });
  return NextResponse.json({ submissions });
}

export async function POST(req) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;
  const limited = rateLimitGuard(`event-submission:${auth.user.uid}`, { limit: 5 });
  if (limited) return limited;
  const body = await req.json().catch(() => ({}));
  const title = clean(body.title, 140);
  const description = clean(body.description, 5000);
  const startTime = new Date(body.startTime);
  const endTime = body.endTime ? new Date(body.endTime) : null;
  if (!title) return NextResponse.json({ error: "Event title is required" }, { status: 400 });
  if (!Number.isFinite(startTime.getTime()) || startTime.getTime() < Date.now() + 15 * 60 * 1000) {
    return NextResponse.json({ error: "Choose a start time at least 15 minutes in the future" }, { status: 400 });
  }
  if (endTime && (!Number.isFinite(endTime.getTime()) || endTime <= startTime)) {
    return NextResponse.json({ error: "The end time must be after the start time" }, { status: 400 });
  }
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const submission = await prisma.eventSubmission.create({
    data: { userId: auth.user.uid, title, description, startTime, endTime },
  });
  return NextResponse.json({ submission }, { status: 201 });
}

export async function PATCH(req) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;
  if (!canModerate(auth.userDoc)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  const decision = body.decision === "approve" ? "approved" : body.decision === "reject" ? "rejected" : "";
  if (!id || !decision) return NextResponse.json({ error: "A submission and valid decision are required" }, { status: 400 });
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const submission = await prisma.eventSubmission.findUnique({ where: { id } });
  if (!submission || submission.status !== "pending") return NextResponse.json({ error: "Pending submission not found" }, { status: 404 });
  let eventId = null;
  if (decision === "approved") {
    const event = await prisma.event.create({
      data: {
        title: submission.title,
        description: submission.description,
        startTime: submission.startTime,
        endTime: submission.endTime,
        roomSlug: null,
        capacity: 0,
        spaceId: null,
        purchasePriceCents: 0,
        publicPreview: false,
        createdBy: submission.userId,
      },
    });
    eventId = event.id;
  }
  const updated = await prisma.eventSubmission.update({
    where: { id },
    data: { status: decision, eventId, reviewedBy: auth.user.uid, reviewedAt: new Date() },
  });
  await logAudit({
    actorId: auth.user.uid,
    actorName: auth.userDoc?.name || auth.user.email || "",
    action: `event.submission_${decision}`,
    targetId: id,
    metadata: { title: submission.title, eventId },
  });
  return NextResponse.json({ submission: updated, eventId });
}
