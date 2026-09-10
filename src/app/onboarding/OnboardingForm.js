"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./onboarding.module.css";

const SKILLS = ["beginner", "intermediate", "advanced", "expert"];
const CRAFTS = ["crochet", "knitting", "weaving", "spinning", "dyeing", "embroidery", "macrame"];
const PROJECTS = ["amigurumi", "garments", "blankets", "accessories", "home-decor", "baby-items", "jewelry"];
const YARNS = ["lace-fingering", "sport-dk", "worsted-aran", "bulky-super", "no-preference"];
const HOOKS = ["small", "medium", "large", "mixed"];
const GOALS = ["learn", "share", "patterns", "connect", "marketplace", "challenges", "courses"];

const labels = (value) => value.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function OnboardingForm({ initial }) {
  const router = useRouter();
  const [form, setForm] = useState({
    skillLevel: initial.skillLevel || "",
    craftInterests: initial.craftInterests || [],
    projectTypes: initial.projectTypes || [],
    yarnPreference: initial.yarnPreference || "",
    hookSize: initial.hookSize || "",
    communityGoals: initial.communityGoals || [],
  });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/onboarding")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setForm((current) => ({
          ...current,
          skillLevel: data.skillLevel || current.skillLevel,
          craftInterests: data.craftInterests?.length ? data.craftInterests : current.craftInterests,
          projectTypes: data.projectTypes?.length ? data.projectTypes : current.projectTypes,
          yarnPreference: data.yarnPreference || current.yarnPreference,
          hookSize: data.hookSize || current.hookSize,
          communityGoals: data.communityGoals?.length ? data.communityGoals : current.communityGoals,
        }));
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const toggle = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: current[field].includes(value)
        ? current[field].filter((item) => item !== value)
        : [...current[field], value],
    }));
  };

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save your preferences");
      router.push("/account?onboarding=complete");
      router.refresh();
    } catch (err) {
      setError(err.message || "Could not save your preferences");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className={styles.loading}>Loading your preferences…</p>;

  return (
    <form className={styles.form} onSubmit={submit}>
      <fieldset className={styles.fieldset}>
        <legend>Skill level</legend>
        <div className={styles.options}>
          {SKILLS.map((value) => (
            <label className={styles.option} key={value}>
              <input type="radio" name="skillLevel" value={value} checked={form.skillLevel === value} onChange={() => setForm({ ...form, skillLevel: value })} required />
              <span>{labels(value)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <ChoiceGroup title="Craft interests" field="craftInterests" options={CRAFTS} form={form} toggle={toggle} />
      <ChoiceGroup title="Project types" field="projectTypes" options={PROJECTS} form={form} toggle={toggle} />

      <div className={styles.twoColumn}>
        <label className={styles.selectLabel}>Yarn weight
          <select value={form.yarnPreference} onChange={(e) => setForm({ ...form, yarnPreference: e.target.value })} required>
            <option value="">Choose one</option>
            {YARNS.map((value) => <option key={value} value={value}>{labels(value)}</option>)}
          </select>
        </label>
        <label className={styles.selectLabel}>Hook or needle size
          <select value={form.hookSize} onChange={(e) => setForm({ ...form, hookSize: e.target.value })} required>
            <option value="">Choose one</option>
            {HOOKS.map((value) => <option key={value} value={value}>{labels(value)}</option>)}
          </select>
        </label>
      </div>

      <ChoiceGroup title="Community goals" field="communityGoals" options={GOALS} form={form} toggle={toggle} />
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.submit} type="submit" disabled={busy}>{busy ? "Saving…" : "Save and continue"}</button>
    </form>
  );
}

function ChoiceGroup({ title, field, options, form, toggle }) {
  return (
    <fieldset className={styles.fieldset}>
      <legend>{title}</legend>
      <div className={styles.options}>
        {options.map((value) => (
          <label className={styles.option} key={value}>
            <input type="checkbox" checked={form[field].includes(value)} onChange={() => toggle(field, value)} />
            <span>{labels(value)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
