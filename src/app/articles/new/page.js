"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewArticlePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      const res = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, excerpt, coverImage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to publish");
      router.push(`/articles/${data.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 64px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#f5f5f5", margin: "0 0 24px" }}>
          Write an article
        </h1>

        {error && (
          <p style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.12)", color: "var(--error)", fontSize: 13, marginBottom: 16 }}>
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#f5f5f5", display: "block", marginBottom: 6 }}>Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Your article title..."
              maxLength={200}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "#f5f5f5",
                fontSize: 18,
                fontWeight: 600,
                outline: "none",
              }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#f5f5f5", display: "block", marginBottom: 6 }}>Cover image URL (optional)</span>
            <input
              type="text"
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
              placeholder="https://..."
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "#f5f5f5",
                fontSize: 14,
                outline: "none",
              }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#f5f5f5", display: "block", marginBottom: 6 }}>
              Content (use **bold**, *italic*, # headings, - lists)
            </span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your article here... Use markdown-style formatting."
              rows={20}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "#f5f5f5",
                fontSize: 14,
                lineHeight: 1.7,
                fontFamily: "monospace",
                resize: "vertical",
                outline: "none",
              }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 20 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#f5f5f5", display: "block", marginBottom: 6 }}>Excerpt (shown in article list)</span>
            <input
              type="text"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="Brief summary of your article..."
              maxLength={300}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "#f5f5f5",
                fontSize: 14,
                outline: "none",
              }}
            />
          </label>

          <button
            type="submit"
            disabled={busy || !title.trim() || !content.trim()}
            style={{
              padding: "12px 24px",
              borderRadius: 10,
              border: "none",
              background: busy || !title.trim() || !content.trim() ? "rgba(167,139,250,0.3)" : "var(--secondary-light)",
              color: "#ffffff",
              fontSize: 15,
              fontWeight: 600,
              cursor: busy || !title.trim() || !content.trim() ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Publishing..." : "Publish article"}
          </button>
        </form>
      </div>
  );
}
