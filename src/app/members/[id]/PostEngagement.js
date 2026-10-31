"use client";

import { useState } from "react";
import { Bookmark, Heart, MessageCircle, Share2 } from "lucide-react";
import styles from "./post-engagement.module.css";

export default function PostEngagement({ post }) {
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [likeCount, setLikeCount] = useState(Object.keys(post.likes || {}).length);
  const [comments, setComments] = useState([]);
  const [comment, setComment] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle(path, key, setter) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/posts/" + encodeURIComponent(post.id) + "/" + path, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Action failed");
      setter(Boolean(data[key]));
      if (key === "liked") setLikeCount(Number(data.count) || 0);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function loadComments() {
    const response = await fetch("/api/posts/" + encodeURIComponent(post.id) + "/comments?limit=50");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not load comments");
    setComments(data.comments || []);
  }

  async function submitComment(event) {
    event.preventDefault();
    if (!comment.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/posts/" + encodeURIComponent(post.id) + "/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: comment.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not post comment");
      setComment("");
      await loadComments();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function sharePost() {
    const url = window.location.origin + "/feed#post-" + encodeURIComponent(post.id);
    try {
      if (navigator.share) await navigator.share({ title: "Community post", url });
      else { await navigator.clipboard.writeText(url); setError("Link copied."); }
    } catch (err) { if (err.name !== "AbortError") setError("Could not share this post."); }
  }

  return (
    <div className={styles.engagement}>
      <div className={styles.actions}>
        <button type="button" aria-pressed={liked} disabled={busy} onClick={() => toggle("like", "liked", setLiked)} className={liked ? styles.active : ""}><Heart size={17} /> Like <span>{likeCount}</span></button>
        <button type="button" aria-expanded={commentsOpen} onClick={async () => { const next = !commentsOpen; setCommentsOpen(next); if (next) { try { await loadComments(); } catch (err) { setError(err.message); } } }}><MessageCircle size={17} /> Comment</button>
        <button type="button" onClick={sharePost}><Share2 size={17} /> Share</button>
        <button type="button" aria-pressed={bookmarked} disabled={busy} onClick={() => toggle("bookmark", "bookmarked", setBookmarked)} className={bookmarked ? styles.active : ""} aria-label={bookmarked ? "Remove bookmark" : "Bookmark post"}><Bookmark size={17} /> {bookmarked ? "Saved" : "Save"}</button>
      </div>
      {error && <p className={styles.feedback} role="status">{error}</p>}
      {commentsOpen && <div className={styles.comments}>
        {comments.map((item) => <div className={styles.comment} key={item.id}><strong>{item.authorName}</strong><p>{item.text}</p></div>)}
        <form onSubmit={submitComment} className={styles.commentForm}>
          <input value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} placeholder="Write a comment…" aria-label="Write a comment" />
          <button type="submit" disabled={!comment.trim() || busy}>Post</button>
        </form>
      </div>}
    </div>
  );
}
