"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./welcome.module.css";

const CRAFTS = ["crochet", "knitting", "weaving", "spinning", "dyeing", "embroidery", "macrame"];
const PROJECTS = ["amigurumi", "garments", "blankets", "accessories", "home decor", "baby items", "jewelry"];
const GOALS = ["learn", "share", "patterns", "connect", "courses"];
const label = (value) => value.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function WelcomeJourney({ initial }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initial.name || "");
  const [username, setUsername] = useState(initial.username || "");
  const [photoURL, setPhotoURL] = useState(initial.photoURL || "");
  const [headline, setHeadline] = useState(initial.headline || "");
  const [location, setLocation] = useState(initial.location || "");
  const [bio, setBio] = useState(initial.bio || "");
  const [skillLevel, setSkillLevel] = useState("beginner");
  const [craftInterests, setCraftInterests] = useState([]);
  const [projectTypes, setProjectTypes] = useState([]);
  const [communityGoals, setCommunityGoals] = useState(["connect"]);
  const [yarnPreference, setYarnPreference] = useState("no-preference");
  const [hookSize, setHookSize] = useState("mixed");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  function toggle(field, value) {
    const setters = { craftInterests: setCraftInterests, projectTypes: setProjectTypes, communityGoals: setCommunityGoals };
    const values = { craftInterests, projectTypes, communityGoals };
    setters[field](values[field].includes(value) ? values[field].filter((item) => item !== value) : [...values[field], value]);
  }

  async function saveProfile(patch) {
    const response = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not save your profile");
  }

  async function uploadPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const upload = await fetch("/api/upload?kind=avatar", { method: "POST", body });
      const uploaded = await upload.json().catch(() => ({}));
      if (!upload.ok || (!uploaded.url && !uploaded.dataUrl)) throw new Error(uploaded.error || "Could not upload that photo");
      const nextPhoto = uploaded.url || uploaded.dataUrl;
      await saveProfile({ photoURL: nextPhoto });
      setPhotoURL(nextPhoto);
    } catch (err) {
      setError(err.message || "Could not upload your photo");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function finish(includeInterests) {
    setError("");
    setBusy(true);
    try {
      if (includeInterests) {
        if (!craftInterests.length || !projectTypes.length || !communityGoals.length) {
          throw new Error("Choose at least one craft, project type and community goal — or skip this step for now.");
        }
        const response = await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            skillLevel, craftInterests, projectTypes, communityGoals,
            yarnPreference, hookSize,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not save your interests");
      }
      const response = await fetch("/api/welcome-journey", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not finish your welcome");
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    setError("");
    setBusy(true);
    try {
      if (step === 0) {
        if (!name.trim()) throw new Error("Add the name you want members to see.");
        if (!/^[a-z0-9._-]{3,24}$/i.test(username.trim())) {
          throw new Error("Username must be 3–24 characters: letters, numbers, dots, underscores or dashes.");
        }
        await saveProfile({ name: name.trim(), username: username.trim().toLowerCase() });
      } else if (step === 1) {
        await saveProfile({ headline, location, bio });
      }
      setStep((current) => current + 1);
    } catch (err) {
      setError(err.message || "Could not save your details");
    } finally {
      setBusy(false);
    }
  }

  const steps = ["Your identity", "Your story", "Your interests"];
  return (
    <section className={styles.card}>
      <p className={styles.eyebrow}>Welcome to Yarnery Lounge</p>
      <h1 className={styles.title}>Let’s make this feel like yours.</h1>
      <p className={styles.intro}>A few quick details help other members recognise you and help us bring the right people, rooms and inspiration your way. You can change everything later.</p>

      <div className={styles.progressMeta}><span>Step {step + 1} of 3</span><span>{Math.round(((step + 1) / 3) * 100)}%</span></div>
      <div className={styles.progressTrack}><span style={{ width: `${((step + 1) / 3) * 100}%` }} /></div>
      <div className={styles.stepLabels}>{steps.map((item, index) => <span key={item} className={index === step ? styles.activeStep : index < step ? styles.pastStep : ""}>{item}</span>)}</div>

      {step === 0 && (
        <div className={styles.content}>
          <div className={styles.identityPreview}>
            <div className={styles.avatar}>
              {photoURL ? <img src={photoURL} alt="Your profile preview" /> : <span>{(name || "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>}
            </div>
            <div><strong>{name || "Your name"}</strong><p>@{username || "your-username"}</p></div>
          </div>
          <label className={styles.photoButton}>{uploading ? "Uploading photo…" : photoURL ? "Change profile photo" : "Add a profile photo"}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={uploadPhoto} disabled={uploading} /></label>
          <p className={styles.hint}>A clear photo makes it easier for people to recognise you in lounges, conversations and the member directory. You can add one now or later.</p>
          <label className={styles.field}>Display name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="The name members will see" autoComplete="name" /></label>
          <label className={styles.field}>Username<input value={username} onChange={(event) => setUsername(event.target.value.replace(/^@/, ""))} maxLength={24} placeholder="choose-a-username" autoComplete="username" /><small>This becomes your unique @handle. Letters, numbers, dots, underscores and dashes.</small></label>
        </div>
      )}

      {step === 1 && (
        <div className={styles.content}>
          <label className={styles.field}>A short headline<input value={headline} onChange={(event) => setHeadline(event.target.value)} maxLength={120} placeholder="e.g. Crochet enthusiast, colour lover" /></label>
          <label className={styles.field}>Where are you based?<input value={location} onChange={(event) => setLocation(event.target.value)} maxLength={80} placeholder="e.g. Nairobi, Kenya" /></label>
          <label className={styles.field}>Tell us about yourself<textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={600} rows={5} placeholder="What do you enjoy making? What are you learning? What would you love to share with the community?" /></label>
          <p className={styles.hint}>Your story helps other Yarnies find common ground and start a conversation.</p>
        </div>
      )}

      {step === 2 && (
        <div className={styles.content}>
          <label className={styles.field}>Your current skill level<select value={skillLevel} onChange={(event) => setSkillLevel(event.target.value)}>{["beginner", "intermediate", "advanced", "expert"].map((v) => <option key={v} value={v}>{label(v)}</option>)}</select></label>
          <ChoiceGroup title="What do you enjoy making?" values={CRAFTS} selected={craftInterests} onToggle={(v) => toggle("craftInterests", v)} />
          <ChoiceGroup title="What projects interest you?" values={PROJECTS} selected={projectTypes} onToggle={(v) => toggle("projectTypes", v)} />
          <ChoiceGroup title="What brings you here?" values={GOALS} selected={communityGoals} onToggle={(v) => toggle("communityGoals", v)} />
          <div className={styles.twoColumn}>
            <label className={styles.field}>Yarn weight<select value={yarnPreference} onChange={(event) => setYarnPreference(event.target.value)}>{["lace-fingering", "sport-dk", "worsted-aran", "bulky-super", "no-preference"].map((v) => <option key={v} value={v}>{label(v)}</option>)}</select></label>
            <label className={styles.field}>Hook / needle size<select value={hookSize} onChange={(event) => setHookSize(event.target.value)}>{["small", "medium", "large", "mixed"].map((v) => <option key={v} value={v}>{label(v)}</option>)}</select></label>
          </div>
          <p className={styles.hint}>This step is optional. You can skip it and set your preferences later.</p>
        </div>
      )}

      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}>
        {step > 0 && <button type="button" className={styles.secondary} onClick={() => { setError(""); setStep((current) => current - 1); }} disabled={busy}>Back</button>}
        {step < 2 ? <button type="button" className={styles.primary} onClick={next} disabled={busy || uploading}>{busy ? "Saving…" : "Save and continue"}</button> : <>
          <button type="button" className={styles.secondary} onClick={() => finish(false)} disabled={busy}>{busy ? "Finishing…" : "Skip for now"}</button>
          <button type="button" className={styles.primary} onClick={() => finish(true)} disabled={busy}>{busy ? "Finishing…" : "Finish and explore"}</button>
        </>}
      </div>
    </section>
  );
}

function ChoiceGroup({ title, values, selected, onToggle }) {
  return <fieldset className={styles.fieldset}><legend>{title}</legend><div className={styles.options}>{values.map((value) => <label key={value} className={selected.includes(value) ? styles.optionSelected : styles.option}><input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} /><span>{label(value)}</span></label>)}</div></fieldset>;
}
