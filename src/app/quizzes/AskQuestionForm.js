"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./quizzes.module.css";

export default function AskQuestionForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/community-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong. Try again.");
        return;
      }
      setTitle("");
      setBody("");
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.askSection}>
      {!open ? (
        <button type="button" className={styles.askButton} onClick={() => setOpen(true)}>
          Ask a question
        </button>
      ) : (
        <form className={styles.askForm} onSubmit={handleSubmit}>
          <h3 className={styles.askTitle}>Ask the community</h3>
          <input
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short title — e.g. Which yarn works for a temperature blanket?"
            maxLength={120}
          />
          <textarea
            className={styles.textarea}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Give as much detail as you can — pattern, hook size, what you've tried."
            rows={4}
            maxLength={4000}
          />
          {error && <p className={styles.errorText}>{error}</p>}
          <div className={styles.askActions}>
            <button type="submit" className={styles.submitButton} disabled={busy || !title.trim() || !body.trim()}>
              {busy ? "Posting…" : "Post question"}
            </button>
            <button type="button" className={styles.cancelButton} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}