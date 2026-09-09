import { getPrisma } from "@/lib/db/prisma";
import { fillTemplate } from "@/lib/server/automations-core";
import { sendEmail } from "@/lib/server/email";
import { createNotification } from "@/lib/server/notifications";
import { awardPoints } from "@/lib/server/gamification";
import { addSpaceMember } from "@/lib/server/spaces";
import { getOrCreateDm, addMessage } from "@/lib/server/chat";
import { recordAutomationRun } from "@/lib/server/automation-history";
import { logError } from "@/lib/server/log";

export { fillTemplate };

function toMillisValue(v) {
  if (v == null) return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  return new Date(v).getTime();
}

export async function getOwnerUser() {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.user.findFirst({
        where: { role: "owner" },
        select: { id: true, name: true, email: true, username: true },
      });
      if (row) {
        return {
          uid: row.id,
          name: row.name || "",
          email: row.email || "",
          username: row.username || "",
        };
      }
    } catch (err) {
      logError("automations.prisma_owner_failed", { error: err.message });
    }
  }
  return null;
}

export async function createAutomation({ name, trigger, action, config = {}, createdBy }) {
  const clean = typeof name === "string" ? name.trim() : "";
  if (!clean) {
    throw Object.assign(new Error("Automation name required"), { code: 400 });
  }
  const prisma = getPrisma();
  if (prisma) {
    try {
      const created = await prisma.automation.create({
        data: {
          name: clean,
          trigger,
          action,
          config,
          active: true,
          createdBy,
          createdAt: new Date(),
        },
      });
      return { id: created.id };
    } catch (err) {
      logError("automations.prisma_create_failed", { error: err.message });
    }
  }
  return { id: "" };
}

function mapAutomationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    trigger: row.trigger,
    action: row.action,
    config: row.config || {},
    active: row.active,
    createdBy: row.createdBy,
    createdAt: toMillisValue(row.createdAt) || 0,
  };
}

export async function listAutomations() {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.automation.findMany({
        orderBy: { createdAt: "desc" },
      });
      return rows.map(mapAutomationRow);
    } catch (err) {
      logError("automations.prisma_list_failed", { error: err.message });
    }
  }
  return [];
}

export async function setAutomationActive(id, active) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const res = await prisma.automation.updateMany({
        where: { id },
        data: { active: !!active },
      });
      if (res.count) return { id };
    } catch (err) {
      logError("automations.prisma_set_active_failed", { error: err.message });
    }
  }
  return null;
}

export async function deleteAutomation(id) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      await prisma.automation.deleteMany({ where: { id } });
      return;
    } catch (err) {
      logError("automations.prisma_delete_failed", { error: err.message });
    }
  }
}

function placeholderValues(context) {
  const values = { ...context };
  if (context.memberName) values.name = context.memberName;
  return values;
}

async function executeAction(automation, context) {
  const { action, config = {} } = automation;
  const values = placeholderValues(context);
  const owner = config.to === "owner" ? await getOwnerUser() : null;

  if (action === "send_email") {
    const to = owner?.email || (config.to && typeof config.to === "string" ? config.to : "");
    if (!to) return;
    await sendEmail({
      to,
      subject: fillTemplate(config.subject, values),
      text: fillTemplate(config.body, values),
    }).catch((err) => {
      logError("automation.email_failed", { error: err.message, automationId: automation.id });
    });
    return;
  }

  if (action === "create_notification") {
    const userId = owner?.uid || config.toUserId || "";
    if (!userId) return;
    const text = fillTemplate(config.message, values);
    await createNotification({
      userId,
      type: "automation",
      actorId: "",
      actorName: "Secret Yarnery",
      text,
      href: config.href || "/dashboard",
    });
    return;
  }

  if (action === "award_points") {
    const points = Math.max(Number(config.points) || 0, 0);
    const subjectUid = context.subjectUid || "";
    if (!subjectUid || points <= 0) return;
    await awardPoints(subjectUid, points, context.subjectName || "Member");
  }

  if (action === "add_member_to_space") {
    const subjectUid = context.subjectUid || "";
    if (!subjectUid) return;
    const targetSpaceId = config.spaceId || context.spaceId || "";
    if (!targetSpaceId) return;
    await addSpaceMember(targetSpaceId, subjectUid, context.subjectName || "Member", "member");
  }

  if (action === "send_dm") {
    const subjectUid = context.subjectUid || "";
    let senderOwner = owner;
    if (!senderOwner) senderOwner = await getOwnerUser();
    if (!subjectUid || !senderOwner) return;
    const text = fillTemplate(config.message, values);
    const conversation = await getOrCreateDm(senderOwner.uid, subjectUid);
    if (!conversation) return;
    await addMessage(
      conversation.id,
      { uid: senderOwner.uid, name: senderOwner.name || "Secret Yarnery" },
      text || "You have a new message from Secret Yarnery."
    );
  }

  if (action === "send_push") {
    const subjectUid = context.subjectUid || config.toUserId || "";
    if (!subjectUid) return;
    const title = fillTemplate(config.title, values) || "Secret Yarnery";
    const body = fillTemplate(config.body, values) || "You have a new notification.";
    await sendPushToUser(subjectUid, title, body, config.href || "/dashboard");
  }
}

export async function runAutomations(trigger, context = {}) {
  let automations = null;
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.automation.findMany({
        where: { active: true, trigger },
      });
      if (rows.length) automations = rows.map(mapAutomationRow);
    } catch (err) {
      logError("automations.prisma_run_failed", { error: err.message });
    }
  }
  if (!automations) automations = [];
  for (const automation of automations) {
    const targetUserId = context.subjectUid || "";
    try {
      await executeAction(automation, context);
      await recordAutomationRun({
        automationId: automation.id,
        trigger,
        action: automation.action,
        targetUserId,
        success: true,
        error: "",
      });
    } catch (err) {
      logError("automation.run_failed", {
        error: err.message,
        trigger,
        automationId: automation.id,
      });
      await recordAutomationRun({
        automationId: automation.id,
        trigger,
        action: automation.action,
        targetUserId,
        success: false,
        error: err.message || "Unknown error",
      });
    }
  }
}

async function sendPushToUser(uid, title, body, url = "/dashboard") {
  const webpush = await import("web-push");
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  if (!vapidPublic || !vapidPrivate || !vapidSubject) {
    throw new Error("Push not configured — add VAPID keys.");
  }
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  let sub = null;
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.pushSubscription.findUnique({ where: { id: uid } });
      if (row) sub = { endpoint: row.endpoint, keys: row.keys };
    } catch (err) {
      logError("automations.prisma_push_failed", { error: err.message });
    }
  }
  if (!sub) return;
  await webpush.sendNotification(
    { endpoint: sub.endpoint, keys: sub.keys },
    JSON.stringify({ title, body, url })
  );
}

export function fireCourseCompleted({ subjectUid, subjectName, memberName, memberEmail, courseId, courseName }) {
  return runAutomations("course_completed", {
    subjectUid,
    subjectName: subjectName || memberName,
    memberName,
    memberEmail,
    courseId,
    courseName,
    completionDate: new Date(),
  });
}

export function fireSpaceJoined({ subjectUid, subjectName, memberName, memberEmail, spaceId, spaceName }) {
  return runAutomations("space_joined", {
    subjectUid,
    subjectName: subjectName || memberName,
    memberName,
    memberEmail,
    spaceId,
    spaceName,
  });
}

export function fireMemberInactive({ subjectUid, subjectName, memberName, memberEmail, spaceId, inactiveDays }) {
  return runAutomations("member_inactive", {
    subjectUid,
    subjectName: subjectName || memberName,
    memberName,
    memberEmail,
    spaceId,
    inactiveDays,
  });
}

export function fireMilestoneReached({ subjectUid, subjectName, memberName, memberEmail, totalPoints, milestonePoints }) {
  return runAutomations("milestone_reached", {
    subjectUid,
    subjectName: subjectName || memberName,
    memberName,
    memberEmail,
    totalPoints,
    milestonePoints,
  });
}
