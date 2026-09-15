import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { canModerate } from "@/lib/server/auth";
import {
  QUESTION_MAX_TITLE,
  QUESTION_MAX_BODY,
  ANSWER_MAX_BODY,
  cleanQuestionParts,
  cleanAnswerBody,
  mapQuestion,
} from "@/lib/server/community-questions-core";

export {
  QUESTION_MAX_TITLE,
  QUESTION_MAX_BODY,
  ANSWER_MAX_BODY,
  cleanQuestionParts,
  cleanAnswerBody,
};

export async function listCommunityQuestions({ status = "" } = {}) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.communityQuestion.findMany({
        where: status ? { status } : {},
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 100,
      });
      return rows.map((row) => mapQuestion(row));
    } catch (err) {
      logError("community_questions.prisma_list_failed", { error: err.message });
    }
  }
  return [];
}

export async function getCommunityQuestion(id) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.communityQuestion.findUnique({
        where: { id },
        include: {
          answers: {
            orderBy: [{ accepted: "desc" }, { createdAt: "asc" }],
          },
        },
      });
      return row ? mapQuestion(row, row.answers) : null;
    } catch (err) {
      logError("community_questions.prisma_get_failed", { error: err.message });
    }
  }
  return null;
}

export async function createCommunityQuestion({ authorId, authorName, title, body }) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const created = await prisma.communityQuestion.create({
        data: {
          authorId,
          authorName: authorName || "Member",
          title,
          body,
          status: "open",
          answerCount: 0,
        },
      });
      return { id: created.id };
    } catch (err) {
      logError("community_questions.prisma_create_failed", { error: err.message });
    }
  }
  return { id: "" };
}

export async function addCommunityAnswer({ questionId, authorId, authorName, body }) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const existing = await prisma.communityQuestion.findUnique({ where: { id: questionId } });
      if (!existing) return { error: "Question not found", status: 404 };
      const created = await prisma.communityAnswer.create({
        data: { questionId, authorId, authorName: authorName || "Member", body },
      });
      await prisma.communityQuestion.update({
        where: { id: questionId },
        data: { answerCount: { increment: 1 }, updatedAt: new Date() },
      });
      return { id: created.id };
    } catch (err) {
      logError("community_questions.prisma_answer_failed", { error: err.message });
    }
  }
  return { error: "Database unavailable", status: 500 };
}

export async function acceptCommunityAnswer({ questionId, answerId, requesterId }) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const question = await prisma.communityQuestion.findUnique({ where: { id: questionId } });
      if (!question) return { error: "Question not found", status: 404 };
      if (question.authorId !== requesterId) {
        return { error: "Only the person who asked can mark an answer", status: 403 };
      }
      const answer = await prisma.communityAnswer.findUnique({ where: { id: answerId } });
      if (!answer || answer.questionId !== questionId) {
        return { error: "Answer not found", status: 404 };
      }
      await prisma.$transaction([
        prisma.communityAnswer.updateMany({
          where: { questionId, id: { not: answerId } },
          data: { accepted: false },
        }),
        prisma.communityAnswer.update({
          where: { id: answerId },
          data: { accepted: true },
        }),
        prisma.communityQuestion.update({
          where: { id: questionId },
          data: { status: "resolved", updatedAt: new Date() },
        }),
      ]);
      return { ok: true };
    } catch (err) {
      logError("community_questions.prisma_accept_failed", { error: err.message });
    }
  }
  return { error: "Database unavailable", status: 500 };
}

export async function deleteCommunityQuestion({ id, requesterId, requesterDoc }) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const question = await prisma.communityQuestion.findUnique({ where: { id } });
      if (!question) return { error: "Question not found", status: 404 };
      if (question.authorId !== requesterId && !canModerate(requesterDoc)) {
        return { error: "You can only delete your own questions", status: 403 };
      }
      await prisma.communityAnswer.deleteMany({ where: { questionId: id } });
      await prisma.communityQuestion.delete({ where: { id } });
      return { ok: true };
    } catch (err) {
      logError("community_questions.prisma_delete_failed", { error: err.message });
    }
  }
  return { error: "Database unavailable", status: 500 };
}