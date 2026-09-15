const test = require("node:test");
const assert = require("node:assert/strict");

const {
  cleanQuestionParts,
  cleanAnswerBody,
  QUESTION_MAX_TITLE,
  QUESTION_MAX_BODY,
  ANSWER_MAX_BODY,
} = require("../community-questions-core.js");

test("cleanQuestionParts trims and caps title and body", () => {
  const { cleanTitle, cleanBody } = cleanQuestionParts({
    title: "  When to block a granny square?  ",
    body: "  Is it before or after joining?  ",
  });
  assert.equal(cleanTitle, "When to block a granny square?");
  assert.equal(cleanBody, "Is it before or after joining?");
});

test("cleanQuestionParts caps title and body lengths", () => {
  const { cleanTitle, cleanBody } = cleanQuestionParts({
    title: "x".repeat(300),
    body: "y".repeat(9000),
  });
  assert.equal(cleanTitle.length, QUESTION_MAX_TITLE);
  assert.equal(cleanBody.length, QUESTION_MAX_BODY);
});

test("cleanQuestionParts tolerates non-string input", () => {
  const { cleanTitle, cleanBody } = cleanQuestionParts({ title: 42, body: null });
  assert.equal(cleanTitle, "");
  assert.equal(cleanBody, "");
});

test("cleanAnswerBody trims, caps, and tolerates missing input", () => {
  assert.equal(cleanAnswerBody("  try a smaller hook  "), "try a smaller hook");
  assert.equal(cleanAnswerBody("z".repeat(8000)).length, ANSWER_MAX_BODY);
  assert.equal(cleanAnswerBody(undefined), "");
});