"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../quizzes.module.css";

export default function AnswerForm({ questionId }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/community-questions/${questionId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong. Try again.");
        return;
      }
      setBody("");
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.answerForm} onSubmit={handleSubmit}>
      <h3 className={styles.askTitle}>Write an answer</h3>
      <textarea
        className={styles.textarea}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Share what you know — tips, links, or step-by-step advice."
        rows={4}
        maxLength={4000}
      />
      {error && <p className={styles.errorText}>{error}</p>}
      <div className={styles.askActions}>
        <button type="submit" className={styles.submitButton} disabled={busy || !body.trim()}>
          {busy ? "Posting…" : "Post answer"}
        </button>
      </div>
    </form>
  );
}