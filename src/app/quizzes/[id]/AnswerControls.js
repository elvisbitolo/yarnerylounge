"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../quizzes.module.css";

export default function AnswerControls({ questionId, answerId }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function accept() {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/community-questions/${questionId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answerId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not accept the answer.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.controls}>
      <button type="button" className={styles.acceptButton} onClick={accept} disabled={busy}>
        {busy ? "Marking…" : "Accept as answer"}
      </button>
      {error && <span className={styles.controlError}>{error}</span>}
    </div>
  );
}