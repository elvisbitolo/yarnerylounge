export const QUESTION_MAX_TITLE = 120;
export const QUESTION_MAX_BODY = 4000;
export const ANSWER_MAX_BODY = 4000;

function toMillis(v) {
  if (!v) return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toIso(v) {
  const ms = toMillis(v);
  return ms == null ? "" : new Date(ms).toISOString();
}

export function cleanQuestionParts({ title, body }) {
  const cleanTitle = (typeof title === "string" ? title : "").trim().slice(0, QUESTION_MAX_TITLE);
  const cleanBody = (typeof body === "string" ? body : "").trim().slice(0, QUESTION_MAX_BODY);
  return { cleanTitle, cleanBody };
}

export function cleanAnswerBody(body) {
  return (typeof body === "string" ? body : "").trim().slice(0, ANSWER_MAX_BODY);
}

export function mapAnswer(row) {
  return {
    id: row.id,
    questionId: row.questionId,
    authorId: row.authorId,
    authorName: row.authorName || "",
    body: row.body,
    accepted: !!row.accepted,
    createdAt: toIso(row.createdAt),
  };
}

export function mapQuestion(row, answers = null) {
  return {
    id: row.id,
    authorId: row.authorId,
    authorName: row.authorName || "",
    title: row.title,
    body: row.body,
    status: row.status || "open",
    answerCount: Number(row.answerCount) || 0,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    answers: answers == null ? null : answers.map(mapAnswer),
  };
}