import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { getSpaceBySlug } from "@/lib/server/spaces";
import { computeNextRun, normalizeSchedule } from "@/lib/server/questions-core";

export { computeNextRun, normalizeSchedule };

function toMillisValue(v) {
  if (v == null) return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  return new Date(v).getTime();
}

function mapQuestionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    text: row.text,
    freq: row.freq ?? undefined,
    hour: row.hour ?? undefined,
    minute: row.minute ?? undefined,
    weekday: row.weekday ?? undefined,
    dayOfMonth: row.dayOfMonth ?? undefined,
    spaceId: row.spaceId || "",
    spaceSlug: row.spaceSlug || "",
    spaceName: row.spaceName || "",
    active: row.active,
    nextRun: toMillisValue(row.nextRun),
    lastPostedAt: toMillisValue(row.lastPostedAt),
    createdBy: row.createdBy,
    createdAt: toMillisValue(row.createdAt),
  };
}

export async function createQuestion({ text, freq, hour, minute, weekday, dayOfMonth, spaceSlug = "", createdBy }) {
  const clean = typeof text === "string" ? text.trim() : "";
  if (!clean) {
    throw Object.assign(new Error("Question text required"), { code: 400 });
  }
  const schedule = normalizeSchedule({ freq, hour, minute, weekday, dayOfMonth });

  let space = null;
  if (spaceSlug) {
    space = await getSpaceBySlug(spaceSlug);
  }

  const nextRun = computeNextRun(schedule, Date.now());

  const prisma = getPrisma();
  if (prisma) {
    try {
      const created = await prisma.question.create({
        data: {
          text: clean,
          freq: schedule.freq ?? undefined,
          hour: schedule.hour ?? undefined,
          minute: schedule.minute ?? undefined,
          weekday: schedule.weekday ?? undefined,
          dayOfMonth: schedule.dayOfMonth ?? undefined,
          spaceId: space?.id || "",
          spaceSlug: space?.slug || "",
          spaceName: space?.name || "",
          active: true,
          nextRun: nextRun ? new Date(nextRun) : null,
          lastPostedAt: null,
          createdBy,
        },
      });
      return { id: created.id };
    } catch (err) {
      logError("questions.prisma_create_failed", { error: err.message });
    }
  }
  return { id: "" };
}

export async function listQuestions() {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.question.findMany({
        orderBy: { createdAt: "desc" },
      });
      return rows.map(mapQuestionRow);
    } catch (err) {
      logError("questions.prisma_list_failed", { error: err.message });
    }
  }
  return [];
}

export async function getQuestion(id) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.question.findUnique({ where: { id } });
      return row ? mapQuestionRow(row) : null;
    } catch (err) {
      logError("questions.prisma_get_failed", { error: err.message });
    }
  }
  return null;
}

export async function updateQuestionActive(id, active) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const existing = await prisma.question.findUnique({ where: { id } });
      if (!existing) return null;
      const schedule = normalizeSchedule(existing);
      await prisma.question.update({
        where: { id },
        data: {
          active: !!active,
          nextRun: active ? new Date(computeNextRun(schedule, Date.now())) : existing.nextRun || null,
        },
      });
      return { id };
    } catch (err) {
      logError("questions.prisma_update_active_failed", { error: err.message });
    }
  }
  return null;
}

export async function deleteQuestion(id) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      await prisma.question.deleteMany({ where: { id } });
      return;
    } catch (err) {
      logError("questions.prisma_delete_failed", { error: err.message });
    }
  }
}

export async function listDueQuestions(now = Date.now()) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.question.findMany({
        where: { active: true, nextRun: { lte: new Date(now) } },
      });
      return rows.map(mapQuestionRow);
    } catch (err) {
      logError("questions.prisma_due_failed", { error: err.message });
    }
  }
  return [];
}

export async function postScheduledQuestion(question, now = new Date()) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const created = await prisma.post.create({
        data: {
          authorId: "system",
          authorName: "Secret Yarnery",
          text: question.text,
          likes: {},
          pinned: false,
          kind: "question",
          hashtags: [],
          bookmarks: {},
          commentCount: 0,
          lastActivityAt: now,
          createdAt: now,
          spaceId: question.spaceId || null,
        },
      });
      return created.id;
    } catch (err) {
      logError("questions.prisma_post_failed", { error: err.message });
    }
  }
  return "";
}

export async function advanceQuestion(question, now = Date.now()) {
  const schedule = normalizeSchedule(question);
  const nextRun = computeNextRun(schedule, now);
  const expected = toMillisValue(question.nextRun);

  const prisma = getPrisma();
  if (prisma) {
    try {
      const existing = await prisma.question.findUnique({ where: { id: question.id } });
      if (!existing) return;
      const current = toMillisValue(existing.nextRun);
      if (current !== expected) return;
      await prisma.question.updateMany({
        where: { id: question.id, nextRun: existing.nextRun },
        data: {
          lastPostedAt: new Date(now),
          nextRun: nextRun ? new Date(nextRun) : null,
        },
      });
    } catch (err) {
      logError("questions.prisma_advance_failed", { error: err.message });
    }
  }
}
