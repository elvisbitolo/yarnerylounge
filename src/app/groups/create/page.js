"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "../groups.module.css";

export default function CreateCirclePage() {
  const router = useRouter();
  const [requestedParent] = useState(() => (
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("parent") || "" : ""
  ));
  const [wantsSubgroup] = useState(() => (
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("type") === "subgroup" : false
  ));
  const [groups, setGroups] = useState([]);
  const [parentGroupId, setParentGroupId] = useState(requestedParent);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/groups", { cache: "no-store" }),
      fetch("/api/me", { cache: "no-store" }),
    ])
      .then(async ([groupsResponse, profileResponse]) => {
        if (!groupsResponse.ok || !profileResponse.ok) throw new Error("Could not load your community access.");
        const [groupData, profile] = await Promise.all([groupsResponse.json(), profileResponse.json()]);
        const movingIn = String(profile.tier || profile.plan || "").toLowerCase() === "moving-in";
        if (!movingIn) throw new Error("Creating crochet circles and subgroups is a Moving In membership privilege.");
        if (active) {
          const mainGroups = (groupData.groups || []).filter((group) => !group.parentGroupId && group.status === "active");
          setGroups(mainGroups);
          setParentGroupId(requestedParent || (wantsSubgroup ? mainGroups[0]?.id || "" : ""));
        }
      })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [requestedParent, wantsSubgroup]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const response = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, parentGroupId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create your crochet circle.");
      setSuccess(parentGroupId ? "Your subgroup is ready. Opening it now…" : "Your crochet circle is ready. Opening it now…");
      router.push(`/groups/${data.slug}`);
      router.refresh();
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const selectedParent = groups.find((group) => group.id === parentGroupId);
  const isSubgroup = !!parentGroupId || wantsSubgroup;
  const needsParent = wantsSubgroup && !parentGroupId;

  if (loading) {
    return <main className={styles.container}><p className={styles.subtitle}>Preparing your circle builder…</p></main>;
  }

  return (
    <main className={styles.container}>
      <Link className={styles.link} href="/groups">← Back to circles</Link>
      <section className={styles.createCircleCard}>
        <p className={styles.createCircleEyebrow}>MOVING IN · COMMUNITY BUILDER</p>
        <h1 className={styles.title}>{isSubgroup ? "Launch a subgroup" : "Create your crochet circle"}</h1>
        <p className={styles.createCircleIntro}>
          {isSubgroup
            ? "Give a smaller group of members a place to connect around one technique, project or shared goal."
            : "Start a community around something you love. Choose a name, invite people in and give your idea a home."}
        </p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {success && <p className={styles.createCircleSuccess} role="status">{success}</p>}
        <form className={styles.createCircleForm} onSubmit={handleSubmit}>
          <label className={styles.createCircleField}>
            <span>{isSubgroup ? "Main crochet circle" : "Make this a subgroup (optional)"}</span>
            <select value={parentGroupId} onChange={(event) => setParentGroupId(event.target.value)}>
              <option value="">Start a new main circle</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.emoji ? group.emoji + " " : ""}{group.name}</option>
              ))}
            </select>
            <small>Subgroups sit one level beneath a main crochet circle. Join the main circle first if you did not create it.</small>
          </label>
          <label className={styles.createCircleField}>
            <span>{isSubgroup ? "Subgroup name" : "Circle name"}</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required placeholder={isSubgroup ? "e.g. Amigurumi Makers" : "e.g. Weekend Crochet Club"} />
          </label>
          <label className={styles.createCircleField}>
            <span>What is this community about?</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1200} rows={4} placeholder="Share the interests, projects or conversations that will bring people together." />
          </label>
          {selectedParent && (
            <p className={styles.createCircleParentNote}>This subgroup will appear inside <strong>{selectedParent.name}</strong>.</p>
          )}
          {needsParent && (
            <p className={styles.createCircleParentNote}>Create a main crochet circle first, or choose an existing circle above, before launching a subgroup.</p>
          )}
          <button className={styles.createCircleSubmit} type="submit" disabled={busy || !name.trim() || needsParent}>
            {busy ? "Creating…" : isSubgroup ? "Launch subgroup" : "Create crochet circle"}
          </button>
        </form>
      </section>
    </main>
  );
}
