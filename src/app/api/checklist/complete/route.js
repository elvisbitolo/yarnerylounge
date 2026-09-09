import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getSettings } from "@/lib/server/settings";
import { runAutomations } from "@/lib/server/automations";
import { logError } from "@/lib/server/log";
import { getPrisma } from "@/lib/db/prisma";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const prisma = getPrisma();
  const [settings, userDoc] = await Promise.all([
    getSettings(),
    getUserDoc(user.uid),
  ]);

  let hasPost = false;
  let hasRsvp = false;
  let hasRoom = false;
  try {
    const [postCount, rsvpCount, roomCount] = await Promise.all([
      prisma.post.count({ where: { authorId: user.uid } }),
      prisma.rsvp.count({ where: { userId: user.uid } }),
      prisma.roomEvent.count({ where: { userId: user.uid } }),
    ]);
    hasPost = postCount > 0;
    hasRsvp = rsvpCount > 0;
    hasRoom = roomCount > 0;
  } catch (err) {
    logError("checklist.complete_counts_failed", { error: err.message, uid: user.uid });
  }

  const checks = {
    profile: !!(userDoc?.bio || userDoc?.headline || userDoc?.location),
    room: hasRoom,
    post: hasPost,
    rsvp: hasRsvp,
  };

  const allDone = settings.welcomeChecklist.every((step) => !!checks[step.key]);
  if (!allDone) {
    return NextResponse.json({ error: "Not all checklist steps are complete" }, { status: 400 });
  }

  const existing = userDoc?.checklistCompletedAt?.toMillis?.();
  const completedAt = new Date();

  const triggerAutomations = () => {
    if (existing) return;
    runAutomations("checklist_complete", {
      subjectUid: user.uid,
      subjectName: userDoc?.name || user.name || "Member",
      memberName: userDoc?.name || user.name || "Member",
      memberEmail: user.email || "",
      checklistSteps: settings.welcomeChecklist.length,
    }).catch((err) => {
      logError("automation.checklist_hook_failed", { uid: user.uid, error: err.message });
    });
  };

  try {
    const existingRow = await prisma.user.findUnique({
      where: { id: user.uid },
      select: { extra: true },
    });
    const extra = { ...(existingRow?.extra || {}) };
    extra.checklistCompletedAt = completedAt;
    await prisma.user.update({
      where: { id: user.uid },
      data: { extra, updatedAt: new Date() },
    });
  } catch (err) {
    logError("checklist.complete_prisma_failed", { error: err.message, uid: user.uid });
    return NextResponse.json({ error: "Could not complete checklist" }, { status: 500 });
  }

  triggerAutomations();

  return NextResponse.json({ completed: true });
}
