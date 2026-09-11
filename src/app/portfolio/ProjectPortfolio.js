"use client";

import { useState } from "react";
import ConfirmModal from "@/components/ConfirmModal";
import styles from "./portfolio.module.css";

const INITIAL = { title: "", description: "", craft: "", projectType: "", yarnDetails: "", hookSize: "", status: "active", featured: false };

export default function ProjectPortfolio({ initialProjects = [] }) {
  const [projects, setProjects] = useState(initialProjects);
  const [form, setForm] = useState(INITIAL);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(null);

  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const imageUrls = [];
      for (const file of files.slice(0, 6)) {
        const data = new FormData();
        data.append("file", file);
        const upload = await fetch("/api/upload?kind=project", { method: "POST", body: data });
        const uploadData = await upload.json().catch(() => ({}));
        if (!upload.ok) throw new Error(uploadData.error || "Image upload failed");
        imageUrls.push(uploadData.url || uploadData.dataUrl);
      }
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, imageUrls }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save project");
      setProjects((prev) => [data.project, ...prev.filter((project) => !data.project.featured || !project.featured)]);
      setForm(INITIAL);
      setFiles([]);
      event.target.reset();
    } catch (err) {
      setError(err.message || "Could not save project");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    const projectId = deleting;
    if (!projectId) return;
    setDeleting(null);
    const response = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    if (response.ok) setProjects((prev) => prev.filter((project) => project.id !== projectId));
  }

  async function changeStatus(project, status) {
    const response = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setProjects((prev) => prev.map((item) => item.id === project.id ? data.project : item));
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>Your workbench</p>
        <h1 className={styles.title}>Project portfolio</h1>
        <p className={styles.subtitle}>Show the community what is on your hook, needles, or loom.</p>
      </header>

      <section className={styles.formCard}>
        <h2>Add a project</h2>
        <form onSubmit={submit}>
          <div className={styles.fieldGrid}>
            <label>Title<input required maxLength={120} value={form.title} onChange={(e) => update("title", e.target.value)} /></label>
            <label>Craft<input maxLength={80} placeholder="Crochet, knitting…" value={form.craft} onChange={(e) => update("craft", e.target.value)} /></label>
            <label>Project type<input maxLength={80} placeholder="Blanket, garment…" value={form.projectType} onChange={(e) => update("projectType", e.target.value)} /></label>
            <label>Yarn or materials<input maxLength={160} value={form.yarnDetails} onChange={(e) => update("yarnDetails", e.target.value)} /></label>
            <label>Hook or needle size<input maxLength={80} value={form.hookSize} onChange={(e) => update("hookSize", e.target.value)} /></label>
            <label>Status<select value={form.status} onChange={(e) => update("status", e.target.value)}><option value="active">In progress</option><option value="completed">Completed</option><option value="archived">Archived</option></select></label>
          </div>
          <label>Description<textarea rows={4} maxLength={2000} value={form.description} onChange={(e) => update("description", e.target.value)} /></label>
          <label>Project photos<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={(e) => setFiles([...e.target.files].slice(0, 6))} /></label>
          <label className={styles.checkbox}><input type="checkbox" checked={form.featured} onChange={(e) => update("featured", e.target.checked)} /> Feature this project on my profile</label>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.submit} disabled={busy}>{busy ? "Saving…" : "Add project"}</button>
        </form>
      </section>

      <section className={styles.projects}>
        <div className={styles.sectionHeader}><h2>Your projects</h2><span>{projects.length}</span></div>
        {projects.length === 0 ? <p className={styles.empty}>Your portfolio is empty. Add your first project above.</p> : (
          <div className={styles.grid}>
            {projects.map((project) => (
              <article key={project.id} className={styles.card}>
                {project.imageUrls?.[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={project.imageUrls[0]} alt="" className={styles.image} />
                )}
                <div className={styles.cardBody}>
                  <div className={styles.cardTitleRow}><h3>{project.title}</h3>{project.featured && <span className={styles.featured}>Featured</span>}</div>
                  <p className={styles.meta}>{[project.craft, project.projectType, project.status].filter(Boolean).join(" · ")}</p>
                  {project.description && <p className={styles.description}>{project.description}</p>}
                  <div className={styles.cardActions}>
                    <select aria-label={`Status for ${project.title}`} value={project.status} onChange={(e) => changeStatus(project, e.target.value)}><option value="active">In progress</option><option value="completed">Completed</option><option value="archived">Archived</option></select>
                    <button type="button" onClick={() => setDeleting(project.id)}>Delete</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <ConfirmModal
        open={!!deleting}
        title="Delete project"
        message="Delete this project from your portfolio?"
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </main>
  );
}
