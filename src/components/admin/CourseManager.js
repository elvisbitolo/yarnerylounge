"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import Nav from "@/components/Nav";
import styles from "@/app/admin/rooms/admin.module.css";

export default function CourseManager({ hostOnly = false }) {
  const router = useRouter();
  const basePath = hostOnly ? "/host" : "/admin";
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("draft");
  const [spaceId, setSpaceId] = useState(() => {
    if (hostOnly && typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("spaceId") || "";
    }
    return "";
  });
  const [courses, setCourses] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [hostScopes, setHostScopes] = useState({ spaces: [], courses: [] });
  const [role, setRole] = useState("member");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadCourses = useCallback(async () => {
    const res = await fetch("/api/courses");
    if (res.ok) setCourses((await res.json()).courses);
  }, []);

  const loadScopes = useCallback(async () => {
    if (!hostOnly) {
      const res = await fetch("/api/spaces?admin=1");
      if (res.ok) setSpaces((await res.json()).spaces);
      return;
    }
    const res = await fetch("/api/host/scopes");
    if (!res.ok) return;
    const { scopes } = await res.json();
    const hostedSpaces = scopes.filter((s) => s.scopeType === "space");
    const hostedCourses = scopes.filter((s) => s.scopeType === "course");
    setHostScopes({ spaces: hostedSpaces, courses: hostedCourses });
    setSpaces(hostedSpaces.map((s) => ({ id: s.scopeId, name: s.name })));
  }, [hostOnly]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      loadCourses();
      loadScopes();
    });
    return unsub;
  }, [router, loadCourses, loadScopes]);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setRole(data.role));
  }, []);

  const visibleCourses = hostOnly
    ? courses.filter(
        (course) =>
          hostScopes.courses.some((s) => s.scopeId === course.id) ||
          hostScopes.spaces.some((s) => s.scopeId === course.spaceId)
      )
    : courses;

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    if (hostOnly && !spaceId) {
      setError("Choose one of the spaces you host");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, status, spaceId }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Failed to create course");
      return;
    }
    setTitle("");
    setDescription("");
    setStatus("draft");
    setSpaceId("");
    await loadCourses();
  }

  async function handleDelete(id) {
    await fetch(`/api/courses/${id}`, { method: "DELETE" });
    await loadCourses();
  }

  return (
    <Nav role={role}>
      <div className={styles.container}>
        <h1 className={styles.title}>Manage courses</h1>

        {hostOnly && hostScopes.spaces.length === 0 ? (
          <p className={styles.empty}>
            You don&apos;t host a space yet. Ask an admin to assign you, or manage
            courses under a course you host from the host tools.
          </p>
        ) : (
          <form className={styles.form} onSubmit={handleCreate}>
            <h2 className={styles.formTitle}>Create a course</h2>
            {error && <p className={styles.error}>{error}</p>}
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
              <label className={styles.label} htmlFor="space">
                Space{hostOnly ? "" : " (optional)"}
              </label>
              <select
                id="space"
                className={styles.input}
                required={hostOnly}
                value={spaceId}
                onChange={(e) => setSpaceId(e.target.value)}
              >
                {!hostOnly && <option value="">No space</option>}
                {hostOnly && <option value="">Select a space</option>}
                {spaces.map((space) => (
                  <option key={space.id} value={space.id}>{space.name}</option>
                ))}
              </select>
            </div>
            <button className={styles.submit} type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create course"}
            </button>
          </form>
        )}

        <h2 className={styles.listTitle}>Existing courses</h2>
        {visibleCourses.length === 0 ? (
          <p className={styles.empty}>No courses yet.</p>
        ) : (
          <div className={styles.list}>
            {visibleCourses.map((course) => (
              <div key={course.id} className={styles.item}>
                <div>
                  <p className={styles.itemName}>{course.title}</p>
                  <p className={styles.itemMeta}>
                    {course.status} ·{" "}
                    <Link
                      className={styles.itemMeta}
                      href={`${basePath}/courses/${course.id}`}
                    >
                      Manage content
                    </Link>
                  </p>
                </div>
                <button className={styles.delete} onClick={() => handleDelete(course.id)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Nav>
  );
}
