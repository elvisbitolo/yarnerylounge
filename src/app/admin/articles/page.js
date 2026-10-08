"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import ContentEditor from "@/components/admin/ContentEditor";
import styles from "../rooms/admin.module.css";

// Staff article editor.
//
// Reads the shared /api/articles list, which deliberately omits `content` (a
// listing should not ship every article body to the browser). The generic
// ContentEditor PATCHes every field in the article spec, so seeding it from
// that summary would send content: "" and erase the body. So the full record is
// fetched on demand from /api/articles/[id] before the editor mounts.

export default function AdminArticlesPage() {
  const router = useRouter();
  const [articles, setArticles] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [role, setRole] = useState("member");
  const [error, setError] = useState("");

  // The generic content PATCH requires moderator for articles, so the UI offers
  // the button to the same roles.
  const canEdit = role === "moderator" || role === "owner";

  const loadArticles = useCallback(async () => {
    const res = await fetch("/api/articles?limit=50");
    if (res.ok) setArticles((await res.json()).articles || []);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      loadArticles();
    });
    return unsub;
  }, [router, loadArticles]);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setRole(data.role || "member"))
      .catch(() => {});
  }, []);

  // Fetch the full record (body included) before handing it to the editor.
  const startEdit = async (id) => {
    if (editing === id) {
      setEditing(null);
      return;
    }
    setError("");
    setLoadingEdit(true);
    try {
      const res = await fetch(`/api/articles/${id}`);
      if (!res.ok) {
        setError("Could not load that article");
        return;
      }
      const full = await res.json();
      setArticles((list) => list.map((a) => (a.id === id ? { ...a, ...full } : a)));
      setEditing(id);
    } catch {
      setError("Could not load that article");
    } finally {
      setLoadingEdit(false);
    }
  };

  return (
      <div className={styles.container}>
        <h1 className={styles.title}>Articles</h1>
        <p className={styles.itemMeta}>
          Edit titles, excerpts, body copy, hashtags and cover images. Deleting and
          moderation stay on the member-facing article pages.
        </p>

        {error ? <p className={styles.error}>{error}</p> : null}

        {articles.length === 0 ? (
          <p className={styles.empty}>No articles yet.</p>
        ) : (
          <div className={styles.list}>
            {articles.map((article) => (
              <div key={article.id} className={styles.item}>
                <div>
                  <p className={styles.itemName}>{article.title || "(untitled)"}</p>
                  <p className={styles.itemMeta}>
                    {article.authorName || "Member"} ·{" "}
                    {article.createdAt
                      ? new Date(article.createdAt).toLocaleDateString()
                      : "unknown date"}
                    {Array.isArray(article.hashtags) && article.hashtags.length
                      ? ` · ${article.hashtags.map((t) => `#${t}`).join(" ")}`
                      : ""}
                  </p>
                </div>
                <div className={styles.itemActions}>
                  {/* /api/articles only requires a signed-in member, so a member
                      can reach this page directly. Hide the button for them rather
                      than letting them click into a 403 from the editor PATCH. */}
                  {canEdit ? (
                    <button
                      className={styles.toggle}
                      disabled={loadingEdit && editing !== article.id}
                      onClick={() => startEdit(article.id)}
                    >
                      {loadingEdit && editing !== article.id
                        ? "Loading"
                        : editing === article.id
                          ? "Close"
                          : "Edit"}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        {articles.map((article) =>
          editing === article.id ? (
            <ContentEditor
              key={article.id}
              kind="article"
              record={article}
              onCancel={() => setEditing(null)}
              onSaved={(id, patch) => {
                setArticles((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
              }}
            />
          ) : null
        )}
      </div>
  );
}