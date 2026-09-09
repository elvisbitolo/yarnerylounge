"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import Nav from "@/components/Nav";
import styles from "../questions/questions.module.css";

export default function AdminSettingsPage() {
  const router = useRouter();
  const [role, setRole] = useState("member");
  const [steps, setSteps] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/settings");
    if (res.ok) {
      const data = await res.json();
      setSteps(data.settings.welcomeChecklist);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      load();
    });
    return unsub;
  }, [router, load]);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setRole(data.role));
  }, []);

  function updateStep(index, patch) {
    setSaved(false);
    setSteps((prev) => prev.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  }

  function addStep() {
    setSaved(false);
    setSteps((prev) => [
      ...prev,
      { key: `step_${prev.length + 1}`, label: "New step", href: "/dashboard", cta: "Go" },
    ]);
  }

  function removeStep(index) {
    setSaved(false);
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ welcomeChecklist: steps }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save settings");
      setSteps(data.welcomeChecklist);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Nav role={role}>
      <div className={styles.container}>
        <h1 className={styles.title}>Welcome Checklist</h1>
        <p className={styles.subtitle}>
          The steps new members see until they finish onboarding. Each step uses
          its key to check completion: profile (bio/headline/location), room
          (attended a live room), post (made a post), rsvp (RSVPed to an event).
        </p>
        {error && <p className={styles.error}>{error}</p>}
        {saved && <p className={styles.notice}>Settings saved.</p>}

        <form className={styles.form} onSubmit={handleSave}>
          {steps.map((step, index) => (
            <div key={`${step.key}-${index}`} className={styles.fieldRow}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={`s-key-${index}`}>Key</label>
                <input
                  id={`s-key-${index}`}
                  className={styles.input}
                  value={step.key}
                  onChange={(e) => updateStep(index, { key: e.target.value })}
                  placeholder="profile"
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={`s-label-${index}`}>Label</label>
                <input
                  id={`s-label-${index}`}
                  className={styles.input}
                  value={step.label}
                  onChange={(e) => updateStep(index, { label: e.target.value })}
                  placeholder="Complete your profile"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={`s-href-${index}`}>Link</label>
                <input
                  id={`s-href-${index}`}
                  className={styles.input}
                  value={step.href}
                  onChange={(e) => updateStep(index, { href: e.target.value })}
                  placeholder="/feed"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={`s-cta-${index}`}>Button</label>
                <input
                  id={`s-cta-${index}`}
                  className={styles.input}
                  value={step.cta}
                  onChange={(e) => updateStep(index, { cta: e.target.value })}
                  placeholder="Open the feed"
                />
              </div>
              <button
                type="button"
                className={styles.delete}
                style={{ marginTop: 26 }}
                onClick={() => removeStep(index)}
              >
                Remove
              </button>
            </div>
          ))}

          <button type="button" className={styles.toggle} onClick={addStep}>
            + Add step
          </button>

          <button className={styles.submit} disabled={busy}>
            {busy ? "Saving…" : "Save checklist"}
          </button>
        </form>
      </div>
    </Nav>
  );
}
