"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import Nav from "@/components/Nav";
import styles from "@/app/admin/rooms/admin.module.css";

export default function CourseEditor({ basePath = "/admin" }) {
  const router = useRouter();
  const { id } = useParams();
  const [course, setCourse] = useState(null);
  const [modules, setModules] = useState([]);
  const [lessons, setLessons] = useState({});
  const [role, setRole] = useState("member");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("draft");
  const [requiredTier, setRequiredTier] = useState("standard");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [publicPreview, setPublicPreview] = useState(false);

  const [moduleTitle, setModuleTitle] = useState("");
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonBody, setLessonBody] = useState("");
  const [lessonKind, setLessonKind] = useState("text");
  const [lessonVideoUrl, setLessonVideoUrl] = useState("");
  const [lessonReleaseAt, setLessonReleaseAt] = useState("");
  const [lessonModuleId, setLessonModuleId] = useState("");

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadCourse = useCallback(async () => {
    const res = await fetch(`/api/courses/${id}`);
    if (res.ok) {
      const { course } = await res.json();
      setCourse(course);
      setTitle(course.title);
      setDescription(course.description || "");
      setStatus(course.status);
      setRequiredTier(course.requiredTier || "standard");
      setPurchasePrice(course.purchasePriceCents ? String((course.purchasePriceCents / 100).toFixed(2)) : "");
      setPublicPreview(!!course.publicPreview);
    }
  }, [id]);

  const loadContent = useCallback(async () => {
    const res = await fetch(`/api/courses/${id}/modules`);
    if (res.ok) {
      const data = await res.json();
      setModules(data.modules);
      setLessons(data.lessons);
      if (data.modules.length > 0 && !data.modules.some((m) => m.id === lessonModuleId)) {
        setLessonModuleId(data.modules[0].id);
      }
    }
  }, [id, lessonModuleId]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      loadCourse();
      loadContent();
    });
    return unsub;
  }, [router, loadCourse, loadContent]);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setRole(data.role));
  }, []);

  async function handleSaveDetails(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch(`/api/courses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, status, requiredTier, purchasePriceCents: purchasePrice ? Math.round(Number(purchasePrice) * 100) : 0, publicPreview }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Failed to save course");
      return;
    }
    await loadCourse();
  }

  async function handleAddModule(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch(`/api/courses/${id}/modules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: moduleTitle }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Failed to add module");
      return;
    }
    setModuleTitle("");
    await loadContent();
  }

  async function handleAddLesson(e) {
    e.preventDefault();
    setError("");
    if (!lessonModuleId) {
      setError("Add a module first");
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/courses/${id}/lessons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        moduleId: lessonModuleId,
        title: lessonTitle,
        body: lessonBody,
        kind: lessonKind,
        videoUrl: lessonVideoUrl,
        releaseAt: lessonReleaseAt ? new Date(lessonReleaseAt).toISOString() : "",
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Failed to add lesson");
      return;
    }
    setLessonTitle("");
    setLessonBody("");
    setLessonKind("text");
    setLessonVideoUrl("");
    setLessonReleaseAt("");
    await loadContent();
  }

  async function handleDeleteModule(moduleId) {
    await fetch(`/api/courses/${id}/modules/${moduleId}`, { method: "DELETE" });
    await loadContent();
  }

  async function handleDeleteLesson(lessonId) {
    await fetch(`/api/courses/${id}/lessons/${lessonId}`, { method: "DELETE" });
    await loadContent();
  }

  return (
    <Nav role={role}>
      <div className={styles.container}>
        <p className={styles.listTitle}>
          <Link className={styles.itemMeta} href={`${basePath}/courses`}>← All courses</Link>
        </p>
        <h1 className={styles.title}>{course?.title || "Manage course"}</h1>

        {error && <p className={styles.error}>{error}</p>}

        <form className={styles.form} onSubmit={handleSaveDetails}>
          <h2 className={styles.formTitle}>Course details</h2>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="title">Title</label>
            <input
              id="title"
              className={styles.input}
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="description">Description</label>
            <textarea
              id="description"
              className={styles.textarea}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="status">Status</label>
            <select
              id="status"
              className={styles.input}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="required-tier">Required membership</label>
            <select
              id="required-tier"
              className={styles.input}
              value={requiredTier}
              onChange={(e) => setRequiredTier(e.target.value)}
            >
              <option value="standard">Any member (Lounge and up)</option>
              <option value="premium">Yarnery Hosts only</option>
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="purchase-price">One-time price (optional)</label>
            <input
              id="purchase-price"
              className={styles.input}
              type="number"
              min={0}
              step="0.01"
              placeholder="e.g. 49.00 to sell this course separately"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Public preview</label>
            <label className={styles.checkCard}>
              <input
                type="checkbox"
                checked={publicPreview}
                onChange={(e) => setPublicPreview(e.target.checked)}
              />
              <span className={styles.checkText}>
                <strong>Show on the public explore page</strong>
                <small>Reveals this course (title, description) to visitors.</small>
              </span>
            </label>
          </div>
          <button className={styles.submit} type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save details"}
          </button>
        </form>

        <form className={styles.form} onSubmit={handleAddModule}>
          <h2 className={styles.formTitle}>Add a module</h2>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="module-title">Module title</label>
            <input
              id="module-title"
              className={styles.input}
              type="text"
              required
              placeholder="e.g. Getting started"
              value={moduleTitle}
              onChange={(e) => setModuleTitle(e.target.value)}
            />
          </div>
          <button className={styles.submit} type="submit" disabled={busy}>
            Add module
          </button>
        </form>

        <form className={styles.form} onSubmit={handleAddLesson}>
          <h2 className={styles.formTitle}>Add a lesson</h2>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="lesson-module">Module</label>
            <select
              id="lesson-module"
              className={styles.input}
              value={lessonModuleId}
              onChange={(e) => setLessonModuleId(e.target.value)}
            >
              {modules.length === 0 && <option value="">No modules yet</option>}
              {modules.map((module) => (
                <option key={module.id} value={module.id}>{module.title}</option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="lesson-title">Lesson title</label>
            <input
              id="lesson-title"
              className={styles.input}
              type="text"
              required
              placeholder="e.g. What you'll learn"
              value={lessonTitle}
              onChange={(e) => setLessonTitle(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="lesson-kind">Lesson type</label>
            <select
              id="lesson-kind"
              className={styles.input}
              value={lessonKind}
              onChange={(e) => setLessonKind(e.target.value)}
            >
              <option value="text">Text</option>
              <option value="video">Video</option>
            </select>
          </div>
          {lessonKind === "video" ? (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="lesson-video">
                Video URL (YouTube link or direct MP4/WebM)
              </label>
              <input
                id="lesson-video"
                className={styles.input}
                type="url"
                placeholder="https://www.youtube.com/watch?v=…"
                value={lessonVideoUrl}
                onChange={(e) => setLessonVideoUrl(e.target.value)}
              />
            </div>
          ) : (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="lesson-body">Lesson content</label>
              <textarea
                id="lesson-body"
                className={styles.textarea}
                rows={6}
                placeholder="Write the lesson here. Each blank line becomes a paragraph."
                value={lessonBody}
                onChange={(e) => setLessonBody(e.target.value)}
              />
            </div>
          )}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="lesson-release">
              Release date (optional — drip scheduling; leave empty for immediate)
            </label>
            <input
              id="lesson-release"
              className={styles.input}
              type="datetime-local"
              value={lessonReleaseAt}
              onChange={(e) => setLessonReleaseAt(e.target.value)}
            />
          </div>
          <button className={styles.submit} type="submit" disabled={busy || modules.length === 0}>
            Add lesson
          </button>
        </form>

        <h2 className={styles.listTitle}>Course content</h2>
        {modules.length === 0 ? (
          <p className={styles.empty}>No modules yet — add one above.</p>
        ) : (
          modules.map((module) => (
            <div key={module.id} className={styles.form}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <h2 className={styles.formTitle} style={{ margin: 0 }}>{module.title}</h2>
                <button className={styles.delete} onClick={() => handleDeleteModule(module.id)}>
                  Delete module
                </button>
              </div>
              {lessons[module.id]?.length === 0 ? (
                <p className={styles.itemMeta} style={{ margin: "12px 0 0" }}>No lessons yet.</p>
              ) : (
                <div className={styles.list} style={{ marginTop: 16 }}>
                  {lessons[module.id]?.map((lesson) => (
                    <div key={lesson.id} className={styles.item}>
                      <div>
                        <p className={styles.itemName}>{lesson.title}</p>
                        <p className={styles.itemMeta}>
                          Lesson {lesson.position}
                          {lesson.kind === "video" ? " · video" : " · text"}
                          {lesson.releaseAt &&
                            ` · unlocks ${new Date(
                              lesson.releaseAt.toMillis ? lesson.releaseAt.toMillis() : lesson.releaseAt
                            ).toLocaleDateString([], { month: "short", day: "numeric" })}`}
                        </p>
                      </div>
                      <button className={styles.delete} onClick={() => handleDeleteLesson(lesson.id)}>
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </Nav>
  );
}
