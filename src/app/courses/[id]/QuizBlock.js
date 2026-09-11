"use client";

import { useState } from "react";
import styles from "./QuizBlock.module.css";
import { PartyPopper } from "lucide-react";

const LETTERS = ["A", "B", "C", "D"];

export default function QuizBlock({ quizId, questions, passingScore, previousResult }) {
  const [answers, setAnswers] = useState(() => questions.map(() => -1));
  const [submitted, setSubmitted] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const hasPrevious = !!previousResult;
  const showIntro = hasPrevious && !submitted;

  async function handleSubmit(e) {
    e.preventDefault();
    if (answers.some((a) => a === -1)) {
      setError("Answer every question before submitting.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/quizzes/${quizId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit quiz");
      setSubmitted({ ...data, answers: [...answers] });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleRetake() {
    setAnswers(questions.map(() => -1));
    setSubmitted(null);
    setError("");
  }

  if (showIntro) {
    return (
      <section className={styles.quiz}>
        <h2 className={styles.title}>Lesson quiz</h2>
        <div className={styles.resultCard}>
          <p className={styles.resultStatus}>
            {previousResult.passed ? <>You passed this quiz <PartyPopper size={14} /></> : "You haven&apos;t passed this quiz yet"}
          </p>
          <p className={styles.resultText}>
            Your score: {previousResult.score}/{previousResult.total} (
            {previousResult.percentage}%)
          </p>
          <button className={styles.retake} onClick={handleRetake}>
            Retake quiz
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.quiz}>
      <h2 className={styles.title}>Lesson quiz</h2>
      <p className={styles.passing}>
        Passing score: {passingScore}% · {questions.length} questions
      </p>

      {error && <p className={styles.error}>{error}</p>}

      <form onSubmit={handleSubmit}>
        <div className={styles.questions}>
          {submitted ? (
            <div className={styles.results}>
              <div
                className={
                  submitted.passed ? `${styles.scoreCard} ${styles.scorePass}` : `${styles.scoreCard} ${styles.scoreFail}`
                }
              >
                <p className={styles.scoreHeading}>
                  {submitted.passed ? <>You passed! <PartyPopper size={14} /></> : "Not this time"}
                </p>
                <p className={styles.scoreText}>
                  {submitted.score} / {submitted.total} correct ({submitted.percentage}%)
                </p>
                <button
                  className={styles.retake}
                  type="button"
                  onClick={handleRetake}
                >
                  Retake quiz
                </button>
              </div>
            </div>
          ) : null}

          {questions.map((q, qi) => (
            <fieldset key={qi} className={styles.question}>
              <legend className={styles.questionText}>
                <span className={styles.questionIndex}>{qi + 1}.</span> {q.question}
              </legend>
              <div className={styles.options}>
                {q.options.map((opt, oi) => {
                  const isSelected = answers[qi] === oi;
                  let optionClass = styles.option;
                  if (submitted) {
                    if (oi === q.correctIndex) optionClass = `${optionClass} ${styles.optionCorrect}`;
                    else if (isSelected) optionClass = `${optionClass} ${styles.optionWrong}`;
                    else optionClass = `${optionClass} ${styles.optionMuted}`;
                  } else if (isSelected) {
                    optionClass = `${optionClass} ${styles.optionSelected}`;
                  }
                  return (
                    <label key={oi} className={optionClass}>
                      <input
                        type="radio"
                        name={`quiz-q-${qi}`}
                        value={oi}
                        checked={isSelected}
                        disabled={!!submitted}
                        onChange={() => {
                          const next = [...answers];
                          next[qi] = oi;
                          setAnswers(next);
                        }}
                      />
                      <span className={styles.optionLetter}>{LETTERS[oi]}</span>
                      <span className={styles.optionText}>{opt}</span>
                      {submitted && oi === q.correctIndex && (
                        <span className={styles.optionBadge}>✓</span>
                      )}
                      {submitted && isSelected && oi !== q.correctIndex && (
                        <span className={`${styles.optionBadge} ${styles.optionBadgeWrong}`}>✗</span>
                      )}
                    </label>
                  );
                })}
              </div>
              {submitted && (
                <p
                  className={
                    answers[qi] === q.correctIndex ? `${styles.explanation} ${styles.explanationCorrect}` : `${styles.explanation} ${styles.explanationWrong}`
                  }
                >
                  {answers[qi] === q.correctIndex ? "Correct. " : "Incorrect. "}
                  {q.explanation || "No explanation provided."}
                </p>
              )}
            </fieldset>
          ))}
        </div>

        {!submitted && (
          <button className={styles.submit} type="submit" disabled={busy}>
            {busy ? "Submitting…" : "Submit quiz"}
          </button>
        )}
      </form>
    </section>
  );
}
