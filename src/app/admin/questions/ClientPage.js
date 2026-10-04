"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import Nav from "@/components/Nav";
import styles from "./questions.module.css";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function nextRunLabel(q) {
  if (!q.active) return "Paused";
  if (!q.nextRun) return "—";
  return `Next: ${new Date(q.nextRun).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export default function AdminQuestionsPage() {
  const router = useRouter();
  const [role, setRole] = useState("member");
  const [spaces, setSpaces] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [text, setText] = useState("");
  const [freq, setFreq] = useState("daily");
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [weekday, setWeekday] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [spaceSlug, setSpaceSlug] = useState("");

  const loadQuestions = useCallback(async () => {
    const res = await fetch("/api/admin/questions");
    if (res.ok) setQuestions((await res.json()).questions);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      fetch("/api/spaces?admin=1")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data && setSpaces(data.spaces))
        .catch(() => {});
      loadQuestions();
    });
    return unsub;
  }, [router, loadQuestions]);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setRole(data.role));
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, freq, hour, minute, weekday, dayOfMonth, spaceSlug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create question");
      setText("");
      setSpaceSlug("");
      await loadQuestions();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(question) {
    setError("");
    try {
      const res = await fetch(`/api/admin/questions/${question.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !question.active }),
      });
      if (!res.ok) throw new Error("Could not update question");
      await loadQuestions();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    setError("");
    try {
      const res = await fetch(`/api/admin/questions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete question");
      await loadQuestions();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
      <Nav role={role}>
      <div className={styles.container}>
        <h1 className={styles.title}>Scheduled questions</h1>
        <p className={styles.subtitle}>
          Publish a question to the feed on a schedule — great for recurring community prompts.
        </p>
        {error && <p className={styles.error}>{error}</p>}

        <form className={styles.form} onSubmit={handleCreate}>
          <h2 className={styles.formTitle}>New question</h2>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="q-text">Question</label>
            <textarea
              id="q-text"
              className={styles.textarea}
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What's one thing you're working on this week?"
              required
            />
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="q-freq">Repeats</label>
              <select
                id="q-freq"
                className={styles.select}
                value={freq}
                onChange={(e) => setFreq(e.target.value)}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="q-hour">Hour</label>
              <input
                id="q-hour"
                className={styles.input}
                type="number"
                min={0}
                max={23}
                value={hour}
                onChange={(e) => setHour(Number(e.target.value))}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="q-minute">Minute</label>
              <input
                id="q-minute"
                className={styles.input}
                type="number"
                min={0}
                max={59}
                value={minute}
                onChange={(e) => setMinute(Number(e.target.value))}
              />
            </div>
            {freq === "weekly" && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="q-weekday">Weekday</label>
                <select
                  id="q-weekday"
                  className={styles.select}
                  value={weekday}
                  onChange={(e) => setWeekday(Number(e.target.value))}
                >
                  {WEEKDAYS.map((day, index) => (
                    <option key={day} value={index}>{day}</option>
                  ))}
                </select>
              </div>
            )}
            {freq === "monthly" && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="q-day">Day of month</label>
                <input
                  id="q-day"
                  className={styles.input}
                  type="number"
                  min={1}
                  max={31}
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(Number(e.target.value))}
                />
              </div>
            )}
            <div className={styles.field}>
              <label className={styles.label} htmlFor="q-space">Space (optional)</label>
              <select
                id="q-space"
                className={styles.select}
                value={spaceSlug}
                onChange={(e) => setSpaceSlug(e.target.value)}
              >
                <option value="">Community feed</option>
                {spaces.map((space) => (
                  <option key={space.id} value={space.slug}>{space.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button className={styles.submit} disabled={busy}>
            {busy ? "Scheduling…" : "Schedule question"}
          </button>
        </form>

        <h2 className={styles.listTitle}>Scheduled questions</h2>
        {questions.length === 0 ? (
          <p className={styles.empty}>No scheduled questions yet.</p>
        ) : (
          <div className={styles.list}>
            {questions.map((q) => (
              <div key={q.id} className={styles.item}>
                <div>
                  <p className={styles.itemName}>{q.text}</p>
                  <p className={styles.itemMeta}>
                    {q.spaceName ? `${q.spaceName} · ` : ""}
                    {new Date(q.createdAt).toLocaleDateString()} · {nextRunLabel(q)}
                  </p>
                </div>
                <div className={styles.itemActions}>
                  <button
                    className={q.active ? styles.toggleOn : styles.toggle}
                    onClick={() => handleToggle(q)}
                  >
                    {q.active ? "Pause" : "Resume"}
                  </button>
                  <button className={styles.delete} onClick={() => handleDelete(q.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
</Nav>
  );
}
