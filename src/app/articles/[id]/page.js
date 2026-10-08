"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import DOMPurify from "dompurify";

function renderMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, '<h3 style="font-size:18px;font-weight:700;margin:24px 0 8px;color:#f5f5f5">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:22px;font-weight:700;margin:28px 0 10px;color:#f5f5f5">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:26px;font-weight:700;margin:32px 0 12px;color:#f5f5f5">$1</h1>')
    .replace(/^- (.+)$/gm, '<li style="margin-left:20px;margin-bottom:4px">$1</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

function safeArticleHtml(content) {
  return DOMPurify.sanitize(renderMarkdown(content || ""), {
    USE_PROFILES: { html: true },
  });
}

function timeAgo(ts) {
  if (!ts) return "";
  const millis = typeof ts === "number" ? ts : new Date(ts).getTime();
  const seconds = Math.floor((Date.now() - millis) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function LikeButton({ articleId, initialLikes }) {
  const [count, setCount] = useState(initialLikes?.length || 0);
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/articles/${articleId}/like`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setCount(data.count);
        setLiked(data.liked);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 36,
        padding: "0 14px",
        borderRadius: 999,
        border: "1px solid",
        borderColor: liked ? "#a78bfa" : "#3a3a4a",
        background: liked ? "rgba(167,139,250,0.15)" : "transparent",
        color: liked ? "#a78bfa" : "#9b9bab",
        fontSize: 13,
        fontWeight: 600,
        cursor: busy ? "default" : "pointer",
        transition: "all 0.15s ease",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 14c1.5-1.5 3-3.5 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3.4 1-4.5 2.5C10.9 4 9.3 3 7.5 3A5.5 5.5 0 0 0 2 8.5c0 2 1.5 4 3 5.5l7 7 7-7z" />
      </svg>
      {count}
    </button>
  );
}

function CommentSection({ articleId }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/articles/${articleId}/comments`)
      .then((r) => (r.ok ? r.json() : { comments: [] }))
      .then((d) => setComments(d.comments || []))
      .catch(() => {});
  }, [articleId]);

  async function handleAdd(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/articles/${articleId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      if (res.ok) {
        const data = await res.json();
        setComments((prev) => [
          ...prev,
          { id: data.id, authorName: "You", text: trimmed, createdAt: new Date().toISOString() },
        ]);
        setText("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 32, borderTop: "1px solid #2a2a3a", paddingTop: 24 }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: "#f5f5f5", margin: "0 0 16px" }}>
        Comments ({comments.length})
      </h3>
      {comments.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
          {comments.map((c) => (
            <div key={c.id} style={{
              background: "#2a2a3a",
              border: "1px solid #3a3a4a",
              borderRadius: 10,
              padding: "12px 16px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#a78bfa" }}>{c.authorName}</span>
                <span style={{ fontSize: 12, color: "#6b6b7b" }}>{timeAgo(c.createdAt)}</span>
              </div>
              <p style={{ fontSize: 14, color: "#e5e5e5", margin: 0, lineHeight: 1.5 }}>{c.text}</p>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={handleAdd} style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          placeholder="Add a comment..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{
            flex: 1,
            height: 40,
            padding: "0 14px",
            background: "#2a2a3a",
            border: "1px solid #3a3a4a",
            borderRadius: 10,
            color: "#f5f5f5",
            fontSize: 14,
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={!text.trim() || busy}
          style={{
            height: 40,
            padding: "0 18px",
            background: text.trim() ? "#7c3aed" : "#3a3a4a",
            color: "#ffffff",
            border: "none",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            cursor: text.trim() && !busy ? "pointer" : "default",
            opacity: text.trim() && !busy ? 1 : 0.5,
          }}
        >
          {busy ? "..." : "Comment"}
        </button>
      </form>
    </div>
  );
}

export default function ArticlePage() {
  const params = useParams();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/articles/${params.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setArticle(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px" }}>
          <p style={{ color: "#9b9bab", fontSize: 13 }}>Loading...</p>
        </div>
    );
  }

  if (!article) {
    return (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#f5f5f5" }}>Article not found</h1>
          <Link href="/articles" style={{ color: "var(--secondary-light)", fontSize: 14, marginTop: 12, display: "inline-block" }}>
            Back to articles
          </Link>
        </div>
    );
  }

  return (
      <article style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 64px" }}>
        <Link href="/articles" style={{ color: "var(--secondary-light)", fontSize: 13, textDecoration: "none", display: "inline-block", marginBottom: 20 }}>
          &larr; All articles
        </Link>

        {article.coverImage && (
          <img
            src={article.coverImage}
            alt=""
            style={{
              width: "100%",
              height: 300,
              objectFit: "cover",
              borderRadius: 14,
              marginBottom: 24,
            }}
          />
        )}

        <h1 style={{ fontSize: 32, fontWeight: 800, color: "#f5f5f5", margin: "0 0 12px", lineHeight: 1.3 }}>
          {article.title}
        </h1>

        <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#9b9bab", marginBottom: 24, flexWrap: "wrap" }}>
          <Link href={`/members/${article.authorId}`} style={{ color: "var(--secondary-light)", textDecoration: "none", fontWeight: 600 }}>
            {article.authorName}
          </Link>
          <span>{article.readTime} min read</span>
          <span>{new Date(article.createdAt).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}</span>
        </div>

        {article.hashtags.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap" }}>
            {article.hashtags.map((tag) => (
              <span key={tag} style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--secondary-light)",
                background: "rgba(167,139,250,0.1)",
                padding: "3px 10px",
                borderRadius: 999,
              }}>
                #{tag}
              </span>
            ))}
          </div>
        )}

        <div
          style={{
            fontSize: 16,
            lineHeight: 1.8,
            color: "#e5e5e5",
          }}
          dangerouslySetInnerHTML={{ __html: safeArticleHtml(article.content) }}
        />

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <LikeButton articleId={params.id} initialLikes={article.likes} />
        </div>

        <CommentSection articleId={params.id} />
      </article>
  );
}
