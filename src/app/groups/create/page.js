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
  const [canCreate, setCanCreate] = useState(false);
  const [parentGroupId, setParentGroupId] = useState(requestedParent);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/groups", { cache: "no-store" })
      .then(async (groupsResponse) => {
        if (!groupsResponse.ok) throw new Error("Could not load your community access.");
        const groupData = await groupsResponse.json();
        if (!groupData.canCreate) throw new Error("Creating crochet circles and subgroups is a Moving In membership privilege.");
        if (active) {
          setCanCreate(true);
          const mainGroups = (groupData.groups || []).filter(
            (group) => !group.parentGroupId && group.status === "active" && (group.joined || group.createdBy === groupData.uid)
          );
          setGroups(mainGroups);
          const requested = mainGroups.find((group) => group.id === requestedParent);
          setParentGroupId(requested?.id || (wantsSubgroup ? mainGroups[0]?.id || "" : ""));
        }
      })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [requestedParent, wantsSubgroup]);

  async function handleImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file for your circle photo.");
      event.target.value = "";
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Circle photos must be 8 MB or smaller.");
      event.target.value = "";
      return;
    }
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload?kind=cover", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not upload this photo.");
      setImageUrl(data.url || data.dataUrl || "");
    } catch (err) {
      setError(err.message || "Could not upload this photo. Please try again.");
    } finally {
      setUploadingImage(false);
      event.target.value = "";
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const response = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, imageUrl, parentGroupId }),
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
        {canCreate && (
        <form className={styles.createCircleForm} onSubmit={handleSubmit}>
          <div className={styles.createCircleField}>
            <span>Circle photo</span>
            <label className={styles.createCirclePhotoPicker}>
              {imageUrl ? (
                <img src={imageUrl} alt="Circle photo preview" className={styles.createCirclePhotoPreview} />
              ) : (
                <span className={styles.createCirclePhotoPlaceholder} aria-hidden="true">＋</span>
              )}
              <span>
                <strong>{imageUrl ? "Change circle photo" : "Add a cover photo"}</strong>
                <small>Choose an image that represents your circle · JPG, PNG or WebP · up to 8 MB</small>
              </span>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={handleImageChange} disabled={uploadingImage} />
            </label>
            {uploadingImage && <small className={styles.createCircleUploadStatus}>Uploading photo…</small>}
            {imageUrl && (
              <button type="button" className={styles.createCircleRemovePhoto} onClick={() => setImageUrl("")}>Remove photo</button>
            )}
          </div>
          <label className={styles.createCircleField}>
            <span>{isSubgroup ? "Main crochet circle" : "Make this a subgroup (optional)"}</span>
            <select value={parentGroupId} onChange={(event) => setParentGroupId(event.target.value)}>
              <option value="">{wantsSubgroup ? "Choose a main circle you belong to" : "Start a new main circle"}</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.emoji ? group.emoji + " " : ""}{group.name}</option>
              ))}
            </select>
            <small>Subgroups sit one level beneath a main crochet circle. Only circles you have joined or created are listed.</small>
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
            <p className={styles.createCircleParentNote}>
              {groups.length
                ? "Choose a main crochet circle above before launching your subgroup."
                : "Join a main crochet circle first. You can explore available circles from the groups page."}
              {" "}<Link className={styles.link} href="/groups">Explore circles</Link>
            </p>
          )}
          <button className={styles.createCircleSubmit} type="submit" disabled={busy || uploadingImage || !name.trim() || needsParent}>
            {busy ? "Creating…" : uploadingImage ? "Uploading photo…" : isSubgroup ? "Launch subgroup" : "Create crochet circle"}
          </button>
        </form>
        )}
      </section>
    </main>
  );
}
