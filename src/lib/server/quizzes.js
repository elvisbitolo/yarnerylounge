import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { validateQuizQuestions } from "@/lib/server/quizzes-core";

export { validateQuizQuestions };

function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapQuizRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    lessonId: row.lessonId,
    moduleId: row.moduleId,
    courseId: row.courseId,
    questions: row.questions,
    passingScore: row.passingScore,
    createdBy: row.createdBy,
    createdAt: toMillis(row.createdAt),
  };
}

function mapQuizResultRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName || "",
    quizId: row.quizId,
    courseId: row.courseId,
    lessonId: row.lessonId,
    score: row.score,
    total: row.total,
    percentage: row.percentage,
    passed: row.passed,
    answers: row.answers,
    completedAt: toMillis(row.completedAt),
  };
}

export async function createQuiz({ lessonId, moduleId, courseId, questions, passingScore, createdBy }) {
  const validated = validateQuizQuestions(questions);
  if (!validated.ok) {
    throw Object.assign(new Error(validated.error), { code: 400 });
  }
  const score = Number(passingScore);
  const passing = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 70;

  const prisma = getPrisma();
  if (prisma) {
    try {
      const created = await prisma.quiz.create({
        data: {
          lessonId,
          moduleId,
          courseId,
          questions: validated.questions,
          passingScore: passing,
          createdBy,
        },
      });
      return { id: created.id };
    } catch (err) {
      logError("quizzes.prisma_create_failed", { error: err.message });
    }
  }
  return { id: "" };
}

export async function getQuizByLesson(lessonId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.quiz.findFirst({ where: { lessonId } });
      return row ? mapQuizRow(row) : null;
    } catch (err) {
      logError("quizzes.prisma_get_by_lesson_failed", { error: err.message });
    }
  }
  return null;
}

export async function getQuiz(quizId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.quiz.findUnique({ where: { id: quizId } });
      return row ? mapQuizRow(row) : null;
    } catch (err) {
      logError("quizzes.prisma_get_failed", { error: err.message });
    }
  }
  return null;
}

export async function deleteQuiz(quizId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      await prisma.quiz.deleteMany({ where: { id: quizId } });
      return;
    } catch (err) {
      logError("quizzes.prisma_delete_failed", { error: err.message });
    }
  }
}

export async function updateQuiz(quizId, data) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const existing = await prisma.quiz.findUnique({ where: { id: quizId } });
      if (!existing) return null;
      const patch = {};
      if (data.questions !== undefined) {
        const validated = validateQuizQuestions(data.questions);
        if (!validated.ok) {
          throw Object.assign(new Error(validated.error), { code: 400 });
        }
        patch.questions = validated.questions;
      }
      if (data.passingScore !== undefined) {
        const score = Number(data.passingScore);
        patch.passingScore = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 70;
      }
      if (Object.keys(patch).length) {
        await prisma.quiz.update({ where: { id: quizId }, data: patch });
      }
      return { id: quizId };
    } catch (err) {
      logError("quizzes.prisma_update_failed", { error: err.message });
    }
  }
  return null;
}

function normalizeAnswer(value, total) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n < total ? n : -1;
}

export async function submitQuiz({ userId, userName, quizId, answers }) {
  const quiz = await getQuiz(quizId);
  if (!quiz) {
    throw Object.assign(new Error("Quiz not found"), { code: 404 });
  }
  if (!Array.isArray(answers) || answers.length !== quiz.questions.length) {
    throw Object.assign(new Error("Answers must match the question count"), { code: 400 });
  }

  let score = 0;
  const answerDetails = quiz.questions.map((question, i) => {
    const selected = normalizeAnswer(answers[i], question.options.length);
    const correct = question.correctIndex;
    const isCorrect = selected === correct;
    if (isCorrect) score += 1;
    return { selected, correct: isCorrect };
  });

  const total = quiz.questions.length;
  const percentage = total ? Math.round((score / total) * 100) : 0;
  const passed = percentage >= (quiz.passingScore ?? 70);

  const prisma = getPrisma();
  if (prisma) {
    try {
      await prisma.quizResult.create({
        data: {
          userId,
          userName: userName || "",
          quizId,
          courseId: quiz.courseId,
          lessonId: quiz.lessonId,
          score,
          total,
          percentage,
          passed,
          answers: answerDetails,
        },
      });
      return { score, total, percentage, passed };
    } catch (err) {
      logError("quizzes.prisma_submit_failed", { error: err.message });
    }
  }
  return { score, total, percentage, passed };
}

export async function getQuizResult(quizId, userId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.quizResult.findFirst({
        where: { quizId, userId },
        orderBy: { completedAt: "desc" },
      });
      return row ? mapQuizResultRow(row) : null;
    } catch (err) {
      logError("quizzes.prisma_result_failed", { error: err.message });
    }
  }
  return null;
}

export async function getQuizResults(courseId, userId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.quizResult.findMany({
        where: { courseId, userId },
        orderBy: { completedAt: "desc" },
      });
      return rows.map(mapQuizResultRow);
    } catch (err) {
      logError("quizzes.prisma_results_failed", { error: err.message });
    }
  }
  return [];
}
