"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import { UPGRADE_URL } from "@/lib/upgrade-url";
import ReportModal from "./ReportModal";
import PostMenu from "./PostMenu";
import MentionInput from "@/components/MentionInput";
import { cardThemeVars } from "@/lib/card-themes";
import { dataUrlToBlob } from "@/lib/data-url";
import { IMAGE_DATA_URL_MAX, isSystemPost } from "@/lib/server/posts-core";
import styles from "./feed.module.css";
import { PenSquare, BarChart3, HelpCircle, Trophy, ScrollText, Pin, PlusCircle, MessageCircle, Crown, FileText, CalendarDays, ChevronDown, Share2, Video, X, Pencil, Trash2, RotateCcw, Bell, BellOff, EyeOff, Lock, Unlock, Archive, History, Quote, Repeat2, VolumeX, Clock } from "lucide-react";
import { embedInfoForUrl, normalizeTag, isValidTag } from "@/lib/feed-utils";

const PAGE_SIZE = 20;
const VIRTUALIZE_AT = 150; // window virtualizer only kicks in for long feeds
// Combinable view pills — any non-empty subset is ANDed server-side.
const FILTER_VIEWS = ["following", "near", "popular", "mine", "bookmarked", "hosts", "unanswered", "trashed", "archived"];

function resizeImage(file, maxSize = 1600) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const scale = Math.min(maxSize / width, maxSize / height, 1);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = () => reject(new Error("Couldn't read that image"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Couldn't read that file"));
    reader.readAsDataURL(file);
  });
}

// Reports isNewBlob so the caller can delete the blob if the post that was
// supposed to reference it never gets created.
async function uploadPostImage(dataUrl) {
  try {
    const fd = new FormData();
    fd.append("file", dataUrlToBlob(dataUrl), "post.jpg");
    const up = await fetch("/api/upload?kind=post", { method: "POST", body: fd });
    const upData = await up.json().catch(() => ({}));
    if (up.ok && upData.url) return { url: upData.url, isNewBlob: true };
  } catch (err) {
    console.error("Post image upload failed", err);
  }
  return { url: dataUrl, isNewBlob: false };
}

// Best effort: the post failed to create, so the blob it would have referenced
// is unreferenced and would otherwise sit in storage forever.
async function deleteUploadedBlob(url) {
  try {
    await fetch("/api/upload?kind=post", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
  } catch (err) {
    console.error("Failed to clean up orphaned post image", err);
  }
}

function timeAgo(ts) {
  if (!ts) return "";
  const parsed = typeof ts.toMillis === "function" ? ts.toMillis() : Number(ts) || Date.parse(ts);
  const millis = Number.isFinite(parsed) ? parsed : 0;
  if (!millis) return "";
  const seconds = Math.floor((Date.now() - millis) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(millis).toLocaleDateString([], { month: "short", day: "numeric" });
}

function renderMentions(text, onTag) {
  if (!text) return "";
  const parts = text.split(/(@[a-zA-Z0-9_]{1,30})/g);
  return parts.map((part, index) => {
    const match = part.match(/^@([a-zA-Z0-9_]{1,30})$/);
    if (!match) return renderHashtags(part, onTag);
    const username = match[1];
    return (
      <Link key={index} className={styles.mention} href={`/members?search=${encodeURIComponent(username)}`}>
        @{username}
      </Link>
    );
  });
}

function renderHashtags(text, onTag) {
  if (!text) return "";
  const parts = text.split(/((?:^|\s)#[a-zA-Z0-9_]+)/g);
  return parts.map((part, index) => {
    const match = part.match(/^(\s*)#([a-zA-Z0-9_]+)$/);
    if (!match) return part;
    const [, space, raw] = match;
    const tag = raw.toLowerCase();
    if (onTag) {
      return (
        <span key={index}>
          {space}
          <button
            type="button"
            className={styles.hashtag}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onTag(tag);
            }}
          >
            #{tag}
          </button>
        </span>
      );
    }
    return (
      <span key={index}>
        {space}
        <Link className={styles.hashtag} href={`/search?hashtag=${encodeURIComponent(tag)}`}>
          #{tag}
        </Link>
      </span>
    );
  });
}

function VideoEmbed({ post }) {
  const info = embedInfoForUrl(post.videoUrl || "");
  if (info.type === "youtube" || info.type === "vimeo") {
    return (
      <div className={styles.videoEmbed}>
        <iframe
          src={info.embedUrl}
          title={post.kind === "win" ? "Win" : "Embedded video"}
          className={styles.videoIframe}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
        />
      </div>
    );
  }
  if (info.type === "video") {
    return (
      <div className={styles.videoEmbed}>
        <video src={info.url} controls preload="metadata" className={styles.videoIframe} />
      </div>
    );
  }
  return (
    <a className={styles.videoLink} href={info.url} target="_blank" rel="noopener noreferrer">
      <span className={styles.videoLinkIcon}><Video size={16} /></span>
      <span className={styles.videoLinkText}>{info.host || info.url}</span>
      <span className={styles.videoLinkArrow}>↗</span>
    </a>
  );
}

const POST_KIND_THEMES = {
  poll: "amber",
  question: "indigo",
  win: "emerald",
  article: "violet",
  event: "rose",
  text: "sky",
  default: "slate",
};

function postCardStyle(kind) {
  return cardThemeVars(POST_KIND_THEMES[kind] || POST_KIND_THEMES.default, { light: true });
}

// Deterministic pastel gradient for comment avatars (mock: violet/green/teal).
const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
  "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)",
  "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)",
  "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
  "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
  "linear-gradient(135deg, #f43f5e 0%, #fb7185 100%)",
];

function avatarGradient(name) {
  let hash = 0;
  const s = name || "?";
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return AVATAR_GRADIENTS[(hash & 0x7fffffff) % AVATAR_GRADIENTS.length];
}

function LikeButton({ likes, uid, disabled, onToggle }) {
  const t = useTranslations("feed");
  const liked = Boolean(likes?.[uid]);
  const count = Object.keys(likes || {}).length;

  return (
    <button
      className={`${styles.like} ${liked ? styles.likeActive : ""}`}
      onClick={onToggle}
      disabled={disabled}
      title={liked ? t("unlikePost") : t("likePost")}
      aria-pressed={liked}
    >
      <svg
        className={styles.likeIcon}
        viewBox="0 0 24 24"
        fill={liked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 14c1.5-1.5 3-3.5 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3.4 1-4.5 2.5C10.9 4 9.3 3 7.5 3A5.5 5.5 0 0 0 2 8.5c0 2 1.5 4 3 5.5l7 7 7-7z" />
      </svg>
      <span>{count}</span>
    </button>
  );
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉", "👏", "💯", "🧶", "⭐"];

function EmojiReactionBar({ postId, commentId, reactions, uid, disabled, onUpdated }) {
  const t = useTranslations("feed");
  const current = reactions || {};
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const list = Object.entries(current)
    .map(([emoji, users]) => ({
      emoji,
      count: Object.keys(users || {}).length,
      mine: Boolean(users?.[uid]),
    }))
    .filter((r) => r.count > 0);

  const mine = (emoji) => {
    const entry = list.find((r) => r.emoji === emoji);
    return entry ? entry.mine : false;
  };

  async function toggle(emoji) {
    if (busy || disabled) return;
    setBusy(true);
    const prev = current;
    const optimistic = { ...prev };
    const users = { ...(optimistic[emoji] || {}) };
    if (users[uid]) delete users[uid];
    else users[uid] = true;
    if (Object.keys(users).length) optimistic[emoji] = users;
    else delete optimistic[emoji];
    if (onUpdated) onUpdated(optimistic);
    try {
      const path = commentId
        ? `/api/posts/${postId}/comments/${commentId}/reactions`
        : `/api/posts/${postId}/reactions`;
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok && onUpdated) onUpdated(prev);
    } catch (err) {
      console.error("Reaction failed", err);
      if (onUpdated) onUpdated(prev);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.reactionRow}>
      {list.map((r) => (
        <button
          key={r.emoji}
          className={`${styles.reactionChip} ${mine(r.emoji) ? styles.reactionChipActive : ""}`}
          onClick={() => toggle(r.emoji)}
          disabled={busy}
          title={`${r.emoji} · ${r.count}`}
        >
          <span>{r.emoji}</span>
          <span>{r.count}</span>
        </button>
      ))}
      <button
        className={styles.reactionAdd}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title={t("addReaction")}
      >
        <PlusCircle size={16} />
      </button>
      {open && (
        <div className={styles.reactionPicker}>
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={styles.reactionPick}
              onClick={() => {
                toggle(emoji);
                setOpen(false);
              }}
              disabled={busy}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BookmarkButton({ bookmarks, uid, disabled, onToggle }) {
  const t = useTranslations("feed");
  const bookmarked = Boolean(bookmarks?.[uid]);

  return (
    <button
      className={`${styles.bookmark} ${bookmarked ? styles.bookmarkActive : ""}`}
      onClick={onToggle}
      disabled={disabled}
      title={bookmarked ? t("removeBookmark") : t("bookmarkPost")}
      aria-pressed={bookmarked}
    >
      <svg
        className={styles.bookmarkIcon}
        viewBox="0 0 24 24"
        fill={bookmarked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
      </svg>
    </button>
  );
}

function PollBlock({ postId, post, uid, disabled }) {
  const t = useTranslations("feed");
  const [counts, setCounts] = useState(post.pollCounts || {});
  const [total, setTotal] = useState(
    post.pollTotal ?? Object.values(post.pollCounts || {}).reduce((a, b) => a + b, 0)
  );
  const [votedOption, setVotedOption] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => (typeof window !== "undefined" ? Date.now() : 0));
  const options = post.pollOptions || [];

  useEffect(() => {
    let active = true;
    fetch(`/api/posts/${postId}/vote`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data && typeof data.votedOption === "number") {
          setVotedOption(data.votedOption);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [postId]);

  const deadlineMs = post.pollDeadline ? new Date(post.pollDeadline).getTime() : 0;
  const isExpired = deadlineMs > 0 && now >= deadlineMs;
  const countdownText = deadlineMs > 0 && !isExpired && now > 0
    ? (() => {
        const diff = deadlineMs - now;
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        if (days > 0) return t("timeRemainingDays", { days, hours });
        if (hours > 0) return t("timeRemainingHours", { hours, mins });
        return t("timeRemainingMins", { mins });
      })()
    : null;

  useEffect(() => {
    if (!deadlineMs || isExpired) return;
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, [deadlineMs, isExpired]);

  async function handleVote(option) {
    if (busy || disabled || votedOption !== undefined) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/posts/${postId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option }),
      });
      if (res.ok) {
        const data = await res.json();
        setCounts(data.counts || {});
        setTotal(Object.values(data.counts || {}).reduce((a, b) => a + b, 0));
        setVotedOption(data.votedOption);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.poll}>
      <p className={styles.pollCount}>
        {t("pollVotes", { count: total })}
        {votedOption !== undefined ? t("youVoted") : ""}
      </p>
      {countdownText && (
        <p style={{ fontSize: 12, color: "#9b9bab", margin: "0 0 8px", fontWeight: 600 }}>
          {countdownText}
        </p>
      )}
      {isExpired && votedOption === undefined && (
        <p style={{ fontSize: 12, color: "#9b9bab", margin: "0 0 8px", fontWeight: 600 }}>
          {t("votingClosed")}
        </p>
      )}
      {options.map((option, index) => {
        const count = counts[index] || 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const mine = votedOption === index;
        return (
          <button
            key={index}
            className={`${styles.pollOption} ${mine ? styles.pollOptionMine : ""}`}
            onClick={() => handleVote(index)}
            disabled={busy || disabled || votedOption !== undefined || isExpired}
          >
            <span className={styles.pollOptionText}>{option}</span>
            {votedOption !== undefined && (
              <span className={styles.pollOptionPct}>
                {count} · {pct}%
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ReportButton({ type, targetId, commentPostId, small }) {
  const t = useTranslations("feed");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className={small ? styles.reportSmall : styles.report}
        onClick={() => setOpen(true)}
        title={t("reportContent")}
      >
        {t("report")}
      </button>
      {open && (
        <ReportModal
          type={type}
          targetId={targetId}
          commentPostId={commentPostId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function CommentList({ postId, uid, userName, userPhotoURL, role, canModerate, disabled, locked, onCommentChanged, onTag }) {
  const t = useTranslations("feed");
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [commentSort, setCommentSort] = useState("newest");
  const [replyTo, setReplyTo] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [editingComment, setEditingComment] = useState("");
  const [commentEditText, setCommentEditText] = useState("");
  // Authoritative in-flight lock. `busy` is state, so it cannot gate two
  // submits that land in the same tick — a double-click reads it as false
  // twice and the second POST goes out anyway. A ref flips synchronously.
  const sendingRef = useRef(false);

  const rootRef = useRef(null);
  const visibleRef = useRef(true);

  useEffect(() => {
    let active = true;
    let timer;
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      if (document.hidden || !visibleRef.current) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/posts/${postId}/comments`);
        if (!res.ok) return;
        const data = await res.json();
        if (active) setComments(data.comments || []);
      } catch {
        /* keep polling */
      } finally {
        inFlight = false;
      }
    };
    load();
    timer = setInterval(load, 60000);
    const onVisible = () => load();
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting;
        if (entry.isIntersecting) load();
      },
      { rootMargin: "150px 0px" }
    );
    const el = rootRef.current;
    if (el) {
      visibilityObserver.observe(el);
      window.addEventListener("focus", onVisible);
      document.addEventListener("visibilitychange", onVisible);
    }
    return () => {
      active = false;
      clearInterval(timer);
      visibilityObserver.disconnect();
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [postId, version]);

  // Add a comment to local state, nesting a reply under its parent the way the
  // server groups them. Lets the send render immediately instead of waiting
  // for the refetch below.
  function insertOptimistic(list, comment) {
    if (!comment.parentId) return [...list, comment];
    return list.map((c) => {
      if (c.id !== comment.parentId) return c;
      return { ...c, replies: [...(c.replies || []), { ...comment, parentId: undefined }] };
    });
  }

  function removeById(list, id) {
    return list
      .filter((c) => c.id !== id)
      .map((c) => (c.replies && c.replies.length ? { ...c, replies: c.replies.filter((r) => r.id !== id) } : c));
  }

  async function handleAdd(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sendingRef.current) return;
    sendingRef.current = true;
    setBusy(true);

    const parentId = replyTo?.id || null;
    const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const optimistic = {
      id: tempId,
      authorId: uid,
      authorName: userName,
      authorRole: role || "member",
      authorPhotoUrl: userPhotoURL || "",
      text: trimmed,
      reactions: {},
      createdAt: Date.now(),
      pending: true,
      ...(parentId ? { parentId } : { replies: [] }),
    };
    // Clear the composer and show the comment straight away. The round trip
    // still has to succeed, so the refetch reconciles both.
    setComments((prev) => insertOptimistic(prev, optimistic));
    setText("");
    if (replyTo) setReplyTo(null);
    if (parentId) {
      setExpanded((prev) => new Set(prev).add(parentId));
    }
    onCommentChanged(postId, 1);

    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, parentId }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({})))?.error) || "Reply failed");
      const data = await res.json().catch(() => ({}));
      setComments((prev) =>
        prev.flatMap((c) => {
          if (c.id === tempId) return data.id ? [{ ...c, id: data.id, pending: false }] : [{ ...c, pending: false }];
          if (c.replies && c.replies.some((r) => r.id === tempId)) {
            return [
              {
                ...c,
                replies: c.replies.map((r) =>
                  r.id === tempId ? { ...r, id: data.id || r.id, pending: false } : r
                ),
              },
            ];
          }
          return [c];
        })
      );
      setVersion((v) => v + 1);
    } catch (err) {
      console.error(err);
      // Roll the optimistic comment back and put the text back so nothing is
      // lost, then let the refetch settle the count.
      setComments((prev) => removeById(prev, tempId));
      setText(trimmed);
      if (parentId) setReplyTo({ id: parentId, name: replyTo?.name });
      onCommentChanged(postId, -1);
      setVersion((v) => v + 1);
      alert(err.message || "Reply failed");
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  }

  async function handleDelete(commentId) {
    const res = await fetch(`/api/posts/${postId}/comments/${commentId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Failed to delete comment");
    } else {
      setVersion((v) => v + 1);
      onCommentChanged(postId, -1);
    }
  }

  function updateComment(id, patch) {
    setComments((prev) =>
      prev.map((cm) => {
        if (cm.id === id) return { ...cm, ...patch };
        if (cm.replies && cm.replies.some((r) => r.id === id)) {
          return { ...cm, replies: cm.replies.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
        }
        return cm;
      })
    );
  }

  async function handleCommentEditSave(commentId) {
    const next = commentEditText.trim();
    if (!next) return;
    const res = await fetch(`/api/posts/${postId}/comments/${commentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: next }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Could not save your edit.");
      return;
    }
    updateComment(commentId, { text: next, editedAt: Date.now() });
    setEditingComment("");
    setCommentEditText("");
  }

  async function handleCommentPin(comment) {
    const res = await fetch(`/api/posts/${postId}/comments/${comment.id}/pin`, { method: "POST" });
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));
    const pinned = typeof data.pinned === "boolean" ? data.pinned : !comment.pinned;
    setComments((prev) =>
      prev.map((cm) => {
        const isTarget = cm.id === comment.id;
        if (!isTarget && !pinned) return cm;
        return { ...cm, pinned: isTarget ? pinned : false };
      })
    );
  }

  const reactionsSum = (c) =>
    Object.values(c.reactions || {}).reduce((s, v) => s + v, 0) +
    (c.replies || []).reduce((s, r) => s + Object.values(r.reactions || {}).reduce((x, v) => x + v, 0), 0);

  const compareComments = (a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    if (commentSort === "oldest") {
      return (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0);
    }
    if (commentSort === "top") {
      return reactionsSum(b) - reactionsSum(a);
    }
    return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
  };

  const toggleExpanded = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderCommentRow = (c, isReply = false) => (
    <div className={`${styles.comment}${isReply ? ` ${styles.commentReply}` : ""}`} key={c.id}>
      <div
        className={styles.commentAvatar}
        style={{ background: avatarGradient(c.authorName) }}
        aria-hidden="true"
      >
        {c.authorPhotoUrl ? (
          <img className={styles.commentAvatarImage} src={c.authorPhotoUrl} alt="" />
        ) : (
          (c.authorName || "?").slice(0, 1).toUpperCase()
        )}
      </div>
      <div className={styles.commentBody}>
        <div className={styles.commentHeader}>
          <span className={styles.commentName}>{c.authorName}</span>
          {(c.authorRole === "owner" || c.authorRole === "moderator") && (
            <span className={styles.commentCrown} title={t("host")}>
              <Crown size={11} />
            </span>
          )}
          {c.pinned && (
            <span className={styles.commentTime} title={t("pinnedComment")}>
              <Pin size={11} /> {t("pinned")}
            </span>
          )}
          <span className={styles.commentTime}>
            {timeAgo(c.createdAt)}
            {c.editedAt ? ` · ${t("edited")}` : ""}
          </span>
          {c.authorId === uid && (
            <button
              className={styles.commentReplyBtn}
              type="button"
              onClick={() => {
                setEditingComment(c.id);
                setCommentEditText(c.text || "");
              }}
            >
              {t("edit")}
            </button>
          )}
          {canModerate && (
            <button
              className={styles.commentReplyBtn}
              type="button"
              onClick={() => handleCommentPin(c)}
              title={c.pinned ? t("unpinComment") : t("pinComment")}
            >
              {c.pinned ? t("unpin") : t("pin")}
            </button>
          )}
          {(c.authorId === uid || canModerate) && (
            <button
              className={styles.deleteSmall}
              onClick={() => handleDelete(c.id)}
              title={t("deleteComment")}
            >
              ×
            </button>
          )}
          {c.authorId !== uid && (
            <ReportButton type="comment" targetId={c.id} commentPostId={postId} small />
          )}
        </div>
        {editingComment === c.id ? (
          <div className={styles.editBox}>
            <textarea
              className={styles.commentInputTextarea || styles.composerInput}
              rows={2}
              value={commentEditText}
              onChange={(e) => setCommentEditText(e.target.value)}
            />
            <div className={styles.commentHeader}>
              <button type="button" className={styles.commentReplyBtn} onClick={() => handleCommentEditSave(c.id)}>
                {t("save")}
              </button>
              <button
                type="button"
                className={styles.commentReplyBtn}
                onClick={() => {
                  setEditingComment("");
                  setCommentEditText("");
                }}
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        ) : (
          <p className={styles.commentText}>{renderMentions(c.text, onTag)}</p>
        )}
        <EmojiReactionBar
          postId={postId}
          commentId={c.id}
          reactions={c.reactions}
          uid={uid}
          disabled={disabled}
          onUpdated={(map) =>
            setComments((prev) =>
              prev.map((cm) => {
                if (cm.id === c.id) return { ...cm, reactions: map };
                if (cm.replies) {
                  return {
                    ...cm,
                    replies: cm.replies.map((r) => (r.id === c.id ? { ...r, reactions: map } : r)),
                  };
                }
                return cm;
              })
            )
          }
        />
        {!locked && editingComment !== c.id && (
          <div className={styles.commentFooterActions}>
            <button
              className={styles.commentReplyBtn}
              type="button"
              disabled={disabled}
              onClick={() => setReplyTo({ id: c.id, name: c.authorName })}
            >
              {t("reply")}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const sortedComments = [...comments].sort(compareComments);

  return (
    <div ref={rootRef} className={styles.comments}>
      <div className={styles.commentListBar}>
        <span className={styles.commentListLabel}>{t("commentsLabel")}</span>
        {comments.length > 0 && (
          <select
            className={styles.commentSort}
            value={commentSort}
            onChange={(e) => setCommentSort(e.target.value)}
            aria-label={t("sortComments")}
          >
            <option value="newest">{t("sortNewest")}</option>
            <option value="oldest">{t("sortOldest")}</option>
            <option value="top">{t("sortTop")}</option>
          </select>
        )}
      </div>
      {comments.length > 0 && (
        <div className={styles.commentList}>
          {sortedComments.map((c) => (
            <div key={c.id} className={styles.commentThread}>
              {renderCommentRow(c)}
              {c.replies && c.replies.length > 0 && (
                <>
                  <button
                    className={styles.repliesToggle}
                    type="button"
                    onClick={() => toggleExpanded(c.id)}
                    aria-expanded={expanded.has(c.id)}
                  >
                    <ChevronDown size={13} className={expanded.has(c.id) ? styles.repliesChevronOpen : ""} />
                    {expanded.has(c.id)
                      ? t("hideReplies", { count: c.replies.length })
                      : t("viewReplies", { count: c.replies.length })}
                  </button>
                  {expanded.has(c.id) && (
                    <div className={styles.repliesList}>
                      {[...c.replies].sort(compareComments).map((r) => renderCommentRow(r, true))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {replyTo && !locked && (
        <div className={styles.replyContext}>
          <span>{t("replyToName", { name: replyTo.name })}</span>
          <button type="button" className={styles.replyCancel} onClick={() => setReplyTo(null)}>
            ×
          </button>
        </div>
      )}
      {locked ? (
        <p className={styles.commentsLocked}>{t("commentsLocked")}</p>
      ) : (
        <form className={styles.commentForm} onSubmit={handleAdd}>
          <div
            className={styles.commentComposerAvatar}
            style={{ background: avatarGradient(userName) }}
            aria-hidden="true"
          >
            {userPhotoURL ? (
              <img className={styles.commentAvatarImage} src={userPhotoURL} alt="" />
            ) : (
              (userName || "?").slice(0, 1).toUpperCase()
            )}
          </div>
          <input
            className={styles.commentInput}
            type="text"
            placeholder={disabled ? t("upgradeToChat") : replyTo ? t("replyToName", { name: replyTo.name }) : t("replyPlaceholder")}
            value={text}
            // Not disabled while sending: the text is cleared on submit, and a
            // disabled box mid-send reads as the app having frozen. `busy` gates
            // the button instead, and sendingRef blocks repeat submits.
            disabled={disabled}
            readOnly={disabled}
            onChange={(e) => setText(e.target.value)}
          />
          <button className={styles.commentSubmit} type="submit" disabled={disabled || !text.trim() || busy}>
            {disabled ? t("upgrade") : busy ? t("replying") : t("reply")}
          </button>
        </form>
      )}
    </div>
  );
}

const EMPTY_POLL = ["", ""];

function PostSkeleton({ showActions = false }) {
  return (
    <div className={styles.skeletonCard} aria-hidden="true">
      <div className={styles.skeletonHeader}>
        <span className={styles.skeletonAvatar} />
        <span className={styles.skeletonLine} style={{ width: "45%" }} />
      </div>
      <span className={styles.skeletonLine} style={{ width: "100%" }} />
      <span className={styles.skeletonLine} style={{ width: "80%" }} />
      {showActions && (
        <div className={styles.skeletonActions}>
          <span className={styles.skeletonChip} />
          <span className={styles.skeletonChip} />
        </div>
      )}
    </div>
  );
}

export default function Feed({ uid, userName, userPhotoURL = "", role, groupId, spaceId, initialKind, canWriteChat = false }) {
  const t = useTranslations("feed");
  const canModerate = role === "owner" || role === "moderator";
  const [posts, setPosts] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [newPosts, setNewPosts] = useState([]);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const searchRef = useRef("");
  const searchTimerRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [showVideoInput, setShowVideoInput] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [kind, setKind] = useState(
    initialKind === "poll" || initialKind === "question" || initialKind === "win"
      ? initialKind
      : "post"
  );
  const [pollOptions, setPollOptions] = useState(EMPTY_POLL);
  const [pollDeadline, setPollDeadline] = useState("");
  // Hashtag chip filter (e.g. clicked #yarn): ANDs with the active view pills.
  const [tag, setTag] = useState("");
  const [copiedIds, setCopiedIds] = useState(new Set());
  // Active view pills, combinable with AND (following + unanswered, etc).
  // Empty array means the full community feed ("all").
  const [views, setViews] = useState([]);
  const [sort, setSort] = useState("newest");
  const [openComments, setOpenComments] = useState(new Set());
  // Post lifecycle UI.
  const [editingId, setEditingId] = useState("");
  const [editText, setEditText] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [historyFor, setHistoryFor] = useState("");
  const [historyItems, setHistoryItems] = useState(null);
  const [pendingUndo, setPendingUndo] = useState(null);
  const [showTrash, setShowTrash] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [mutedIds, setMutedIds] = useState(() => new Set());
  const [notifIds, setNotifIds] = useState(() => new Set());
  // Composer extras.
  const [composerSchedule, setComposerSchedule] = useState("");
  const [composerSensitive, setComposerSensitive] = useState(false);
  const [showComposerOptions, setShowComposerOptions] = useState(false);
  const [composerAlt, setComposerAlt] = useState("");
  const [quoteOf, setQuoteOf] = useState("");
  const [quotePreview, setQuotePreview] = useState("");
  const fileInputRef = useRef(null);
  const sentinelRef = useRef(null);
  const scrollKeyRef = useRef(null);
  const focusRef = useRef("");
  const feedRequestRef = useRef(0);
  const loadingMoreRef = useRef(false);

  // Track the current sort in a ref so URL/cache/sort helpers stay stable
  // across renders. Must be declared before sortFeedPosts below, which reads
  // it (the react-compiler flags a forward reference into a ref).
  const sortRef = useRef(sort);
  useEffect(() => {
    sortRef.current = sort;
  }, [sort]);

  const sortFeedPosts = useCallback(
    (list) => {
      // For non-chronological sorts the server holds the authoritative order
      // (top by likes, latest activity, oldest). Only the default "newest"
      // view re-sorts client-side so a fresh post can surface immediately.
      if ((sortRef.current || "newest") !== "newest") return list;
      return [...list].sort((a, b) => {
        const ap = a.pinned ? 1 : 0;
        const bp = b.pinned ? 1 : 0;
        if (ap !== bp) return bp - ap;
        const at = a.createdAt?.toMillis?.() || Number(a.createdAt) || 0;
        const bt = b.createdAt?.toMillis?.() || Number(b.createdAt) || 0;
        return bt - at;
      });
    },
    []
  );

  // Track the active views in a ref so loaders capture them without forcing
  // the mount effect (or each other) to re-run on filter changes.
  const filterRef = useRef(views);
  useEffect(() => {
    filterRef.current = views;
  }, [views]);

  // Same pattern for the hashtag chip.
  const tagRef = useRef(tag);
  useEffect(() => {
    tagRef.current = tag;
  }, [tag]);

  const cacheKeyFor = useCallback(
    (mode) => `feed:v2:${spaceId || "home"}:${groupId || "home"}:${mode}:${sortRef.current || "newest"}:${searchRef.current?.trim() || ""}:${tagRef.current || ""}`,
    [spaceId, groupId]
  );

  // Real counts computed server-side over the full visible feed (not just the
  // loaded page). Falls back to page-scoped numbers until the first response.
  const [counts, setCounts] = useState(null);
  const [featured, setFeatured] = useState([]);
  const countOf = useCallback(
    (mode) => {
      if (counts && typeof counts.total === "number") {
        const value = counts[mode];
        if (typeof value === "number") return value;
      }
      return undefined;
    },
    [counts]
  );

  const feedUrlFor = useCallback(
    (mode, after) => {
      const params = new URLSearchParams();
      if (spaceId) params.set("spaceId", spaceId);
      if (groupId) params.set("groupId", groupId);
      // mode is either an array of active views, or legacy strings like
      // "all" / a single view name.
      const viewList = Array.isArray(mode)
        ? mode
        : mode && mode !== "all"
          ? [mode]
          : [];
      for (const v of viewList) {
        if (FILTER_VIEWS.includes(v)) params.append("filter", v);
      }
      params.set("sort", sortRef.current || "newest");
      const q = searchRef.current?.trim();
      if (q) params.set("q", q);
      if (tagRef.current) params.set("tag", tagRef.current);
      params.set("limit", String(PAGE_SIZE));
      if (after) params.set("after", after);
      return `/api/posts?${params.toString()}`;
    },
    [spaceId, groupId]
  );

  const patchPost = useCallback((id, patch) => {
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const patchCommentCount = useCallback((id, delta) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, commentCount: Math.max(0, (p.commentCount || 0) + delta) } : p
      )
    );
  }, []);

  // Share deep link: the recipient lands on the feed with the post's comments
  // open and the card scrolled into view. If the post sits outside the loaded
  // page, the single-post endpoint merges it in.
  const applyFocus = useCallback(
    async (id) => {
      if (!id) return;
      const ensureAndScroll = () => {
        const el = document.getElementById(`feed-post-${id}`);
        if (!el) return false;
        setOpenComments((prev) => {
          const next = new Set(prev);
          next.add(id);
          return next;
        });
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        return true;
      };
      for (let i = 0; i < 8; i += 1) {
        if (ensureAndScroll()) return;
        await new Promise((r) => setTimeout(r, 120));
      }
      try {
        const res = await fetch(`/api/posts/${id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.post) return;
        setPosts((prev) =>
          prev.some((p) => p.id === id) ? prev : sortFeedPosts([data.post, ...prev])
        );
        for (let i = 0; i < 6; i += 1) {
          if (ensureAndScroll()) return;
          await new Promise((r) => setTimeout(r, 120));
        }
      } catch {
        /* best-effort: shared posts outside the page merge is optional */
      }
    },
    [sortFeedPosts]
  );

  // Session-scoped SWR-ish cache: render the last page instantly, refresh in
  // the background, and (thanks to the union below) never show a blank screen
  // when the network is slow or briefly offline.
  const readFeedCache = useCallback(
    (mode) => {
      try {
        const raw = sessionStorage.getItem(cacheKeyFor(mode));
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data?.posts || Date.now() - data.at > 90_000) return null;
        return data.posts;
      } catch {
        return null;
      }
    },
    [cacheKeyFor]
  );
  const writeFeedCache = useCallback(
    (mode, list) => {
      try {
        sessionStorage.setItem(cacheKeyFor(mode), JSON.stringify({ at: Date.now(), posts: sortFeedPosts(list) }));
      } catch (err) {
        console.error("Feed cache write failed", err);
      }
    },
    [cacheKeyFor, sortFeedPosts]
  );

  const loadFirst = useCallback(
    async (modeOverride) => {
      const requestId = ++feedRequestRef.current;
      loadingMoreRef.current = false;
      setLoadingMore(false);
      setLoadMoreError(false);
      setNextCursor(null);
      setHasMore(false);
      setNewPosts([]);
      const mode = modeOverride !== undefined ? modeOverride : filterRef.current;
      const cached = readFeedCache(mode);
      if (cached && cached.length) {
        setPosts(sortFeedPosts(cached));
        setInitialLoading(false);
        setLoadError(false);
      } else {
        setInitialLoading(true);
      }
      try {
        const res = await fetch(feedUrlFor(mode));
        if (!res.ok) throw new Error("Feed read failed");
        const data = await res.json();
        if (requestId !== feedRequestRef.current) return;
        const page = sortFeedPosts(data.posts || []);
        setPosts(page);
        setNextCursor(data.nextCursor || null);
        setHasMore(Boolean(data.hasMore));
        if (data.counts) setCounts(data.counts);
        if (data.featured) setFeatured(data.featured);
        setLoadError(false);
        writeFeedCache(mode, page);
        setNewPosts([]);
      } catch (err) {
        if (requestId !== feedRequestRef.current) return;
        console.error("Feed read failed", err);
        if (cached && cached.length) {
          setLoadError(false);
        } else {
          setLoadError(true);
        }
      } finally {
        if (requestId === feedRequestRef.current) setInitialLoading(false);
      }
    },
    [readFeedCache, writeFeedCache, feedUrlFor, sortFeedPosts]
  );

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore || initialLoading) return;
    loadingMoreRef.current = true;
    const requestId = feedRequestRef.current;
    setLoadingMore(true);
    setLoadMoreError(false);
    const after = nextCursor;
    try {
      const res = await fetch(feedUrlFor(filterRef.current, after));
      if (!res.ok) throw new Error("Feed load more failed");
      const data = await res.json();
      if (requestId !== feedRequestRef.current) return;
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const fresh = (data.posts || []).filter((p) => !seen.has(p.id));
        return sortFeedPosts([...prev, ...fresh]);
      });
      setNextCursor(data.nextCursor || null);
      setHasMore(Boolean(data.hasMore));
      if (data.counts) setCounts(data.counts);
      if (data.featured) setFeatured(data.featured);
    } catch (err) {
      if (requestId !== feedRequestRef.current) return;
      console.error("Feed load more failed", err);
      setLoadMoreError(true);
    } finally {
      if (requestId === feedRequestRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [hasMore, initialLoading, nextCursor, feedUrlFor, sortFeedPosts]);

  const checkNewPosts = useCallback(async () => {
    if (groupId || spaceId || filterRef.current.length > 0 || tagRef.current || searchRef.current?.trim()) return;
    if ((sortRef.current || "newest") !== "newest") return;
    try {
      const res = await fetch(feedUrlFor("all"));
      if (!res.ok) return;
      const data = await res.json();
      if (!data.posts || !data.posts.length) return;
      setPosts((prev) => {
        const knownIds = new Set(prev.map((p) => p.id));
        const newestKnown = prev.reduce((max, p) => (!p.pinned ? Math.max(max, Number(p.createdAt) || 0) : max), 0);
        const unseen = data.posts.filter((p) => !p.pinned && !knownIds.has(p.id) && Number(p.createdAt) > newestKnown);
        if (unseen.length) {
          setNewPosts((existing) => {
            const merged = sortFeedPosts([...existing, ...unseen]);
            return merged.slice(0, PAGE_SIZE);
          });
          try {
            const sr = document.querySelector('[aria-live="polite"][data-feed-live]');
            if (sr) sr.textContent = t("newPosts", { count: unseen.length });
          } catch {}
        }
        return prev;
      });
    } catch {
      /* transient poll failure — next tick retries */
    }
  }, [groupId, spaceId, feedUrlFor, sortFeedPosts, t]);

  // Initial load + light polling for the "N new posts" banner. Runs once per
  // environment change (not per filter click) — the tab buttons below trigger
  // their own loads for the communities feed.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const focusId = params.get("focus");
      if (focusId) {
        focusRef.current = focusId;
        params.delete("focus");
        const query = params.toString();
        window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
      }
    } catch {}
    const loadForSession = () => {
      loadFirst("all").then(() => {
        if (!focusRef.current) return;
        const focusId = focusRef.current;
        focusRef.current = "";
        setTimeout(() => applyFocus(focusId), 60);
      });
    };
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so the fresh session cookie is sent
        window.location.assign("/login");
        return;
      }
      loadForSession();
    });
    const interval = setInterval(() => {
      if (document.hidden) return;
      checkNewPosts();
    }, 25000);
    const onVisible = () => {
      if (!document.hidden) checkNewPosts();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      unsubAuth();
    };
  }, [groupId, spaceId, loadFirst, checkNewPosts, applyFocus]);

  // Sort is server-side: changing it refetches the current view rather than
  // re-sorting just the loaded page. The reload fires from an effect below so
  // the ref stays synced with `sort` before loadFirst reads it.
  const changeSort = useCallback(
    (value) => {
      setSort(value);
    },
    []
  );

  useEffect(() => {
    const reload = setTimeout(() => {
      loadFirst(filterRef.current);
    }, 0);
    return () => clearTimeout(reload);
  }, [sort, loadFirst]);

  // IntersectionObserver sentinel -> infinite scroll. Off the main thread, and
  // prefetches 300px before the user reaches the end.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loadingMore && !initialLoading) {
          loadMore();
        }
      },
      { rootMargin: "300px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, initialLoading, loadMore]);

  // Scroll restoration on back-navigation / tab regain.
  useEffect(() => {
    const key = `feed:scroll:${spaceId || groupId || "home"}`;
    scrollKeyRef.current = key;
    try {
      const saved = sessionStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Date.now() - parsed.t < 5 * 60_000 && typeof parsed.y === "number") {
          requestAnimationFrame(() => window.scrollTo(0, parsed.y));
        }
      }
    } catch {}
    const persist = () => {
      try {
        sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), y: window.scrollY }));
      } catch {}
    };
    window.addEventListener("pagehide", persist);
    window.addEventListener("beforeunload", persist);
    return () => {
      window.removeEventListener("pagehide", persist);
      window.removeEventListener("beforeunload", persist);
    };
  }, [spaceId, groupId]);

  // Draft autosave: restores an unfinished composer state on return, and
  // persists text/poll state (never the image, which may be a large data URL).
  useEffect(() => {
    const key = `feed:draft:${uid}:${groupId || spaceId || "home"}`;
    let d = null;
    try {
      const raw = localStorage.getItem(key);
      if (raw) d = JSON.parse(raw);
    } catch {
      d = null;
    }
    if (!d || typeof d.text !== "string" || !d.text.trim()) return;
    // Defer the restore off the effect body: the values come from storage, not
    // from React, so there is nothing to synchronize synchronously and setting
    // state here would only add a cascading render.
    queueMicrotask(() => {
      setText(d.text);
      if (d.kind === "poll" || d.kind === "question" || d.kind === "win") setKind(d.kind);
      if (Array.isArray(d.pollOptions) && d.pollOptions.length >= 2 && d.pollOptions.length <= 5) {
        setPollOptions(d.pollOptions);
      }
      if (typeof d.pollDeadline === "string") setPollDeadline(d.pollDeadline);
      if (typeof d.videoUrl === "string" && d.videoUrl) setVideoUrl(d.videoUrl);
      setDraftRestored(true);
    });
  }, [uid, groupId, spaceId]);

  useEffect(() => {
    const key = `feed:draft:${uid}:${groupId || spaceId || "home"}`;
    const timer = setTimeout(() => {
      const empty = !text.trim() && !videoUrl && pollOptions.every((o) => !o.trim()) && !pollDeadline && kind === "post";
      try {
        if (empty) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, JSON.stringify({ text, kind, pollOptions, pollDeadline, videoUrl, at: Date.now() }));
        }
      } catch {}
    }, 400);
    return () => clearTimeout(timer);
  }, [text, kind, pollOptions, pollDeadline, videoUrl, uid, groupId, spaceId]);

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file || uploading) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("Image must be under 10 MB.");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await resizeImage(file);
      if (dataUrl.length > 2_800_000) {
        alert("That image is too large to attach yet — try a smaller one.");
        return;
      }
      setImageUrl(dataUrl);
    } catch (err) {
      console.error(err);
      alert("Couldn't process that image. Try a different one.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const handlePost = useCallback(
    async (e) => {
      e.preventDefault();
      const trimmed = text.trim();
      if (imageUrl && videoUrl) {
        alert("A post can have an image or a video, not both.");
        return;
      }
      const tag = /\b#win\b/i.test(trimmed) ? "" : "#win";
      const payloadText = kind === "win" && trimmed ? `${trimmed} ${tag}`.trim() : trimmed;
      const cleanPoll = pollOptions
        .map((opt) => opt.trim())
        .filter((opt) => opt.length > 0);
      if (kind === "poll") {
        if (cleanPoll.length < 2 || busy || uploading) return;
      } else if ((!trimmed && !imageUrl && !videoUrl) || busy || uploading) {
        return;
      }
      setBusy(true);
      // Hoisted so the catch can clean up a blob this attempt created.
      let uploadedBlobUrl = "";
      try {
        // Store the image in object storage rather than inline in the post row.
        // Falls back to the data URL if storage is unavailable, so posting still works.
        const { url: storedImageUrl, isNewBlob } = imageUrl.startsWith("data:")
          ? await uploadPostImage(imageUrl)
          : { url: imageUrl, isNewBlob: false };
        if (isNewBlob) uploadedBlobUrl = storedImageUrl;
        // The composer accepts images up to 2.8MB but /api/posts rejects inline
        // data URLs over IMAGE_DATA_URL_MAX. Without this the fallback path would
        // post, get rejected, and lose the user's text with only "Post failed".
        if (storedImageUrl.startsWith("data:") && storedImageUrl.length > IMAGE_DATA_URL_MAX) {
          throw new Error("That image is too large to post here. Try a smaller one.");
        }
        const res = await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: payloadText,
            imageUrl: storedImageUrl,
            videoUrl: videoUrl || "",
            groupId: groupId || "",
            spaceId: spaceId || "",
            kind,
            pollOptions: kind === "poll" ? cleanPoll : [],
            pollDeadline: kind === "poll" && pollDeadline ? pollDeadline : "",
            scheduledAt: composerSchedule || "",
            sensitive: composerSensitive,
            altText: composerAlt || "",
            quoteOfId: quoteOf || "",
          }),
        });
        if (!res.ok) throw new Error(((await res.json().catch(() => ({})))?.error) || "Post failed");
        const data = await res.json().catch(() => ({}));
        const optimisticPost = {
          id: data.id || `local-${Date.now()}`,
          authorId: uid,
          authorName: userName,
          authorRole: role || "member",
          text: payloadText,
          kind,
          imageUrl: storedImageUrl || "",
          videoUrl: videoUrl || "",
          altText: composerAlt || "",
          sensitive: composerSensitive,
          scheduledAt: composerSchedule ? new Date(composerSchedule).getTime() : 0,
          quoteOfId: quoteOf || "",
          likes: {},
          bookmarks: {},
          reactions: {},
          pinned: false,
          pinnedAt: 0,
          hashtags: [],
          commentCount: 0,
          lastActivityAt: Date.now(),
          createdAt: Date.now(),
          spaceId: spaceId || "",
          groupId: groupId || "",
          pollOptions: kind === "poll" ? cleanPoll : [],
          pollCounts: {},
          pollTotal: 0,
          pollDeadline: 0,
          pollStatus: "",
        };
        setPosts((prev) => sortFeedPosts([optimisticPost, ...prev]));
        setText("");
        setImageUrl("");
        setVideoUrl("");
        setShowVideoInput(false);
        setKind("post");
        setPollOptions(EMPTY_POLL);
        setPollDeadline("");
        setComposerSchedule("");
        setComposerSensitive(false);
        setComposerAlt("");
        setQuoteOf("");
        setQuotePreview("");
        setDraftRestored(false);
        try {
          localStorage.removeItem(`feed:draft:${uid}:${groupId || spaceId || "home"}`);
        } catch {}
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (err) {
        if (uploadedBlobUrl) await deleteUploadedBlob(uploadedBlobUrl);
        console.error(err);
        alert(err.message || "Post failed. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [text, imageUrl, videoUrl, busy, uploading, groupId, spaceId, kind, pollOptions, pollDeadline, composerSchedule, composerSensitive, composerAlt, quoteOf, uid, userName, role, sortFeedPosts]
  );

  function setPollOption(index, value) {
    setPollOptions((prev) => prev.map((opt, i) => (i === index ? value : opt)));
  }

  function addPollOption() {
    setPollOptions((prev) =>
      prev.length < 5 ? [...prev, ""] : prev
    );
  }

  function removePollOption(index) {
    setPollOptions((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleLike(post) {
    const likes = post.likes || {};
    const already = Object.prototype.hasOwnProperty.call(likes, uid);
    const optimisticLikes = { ...likes };
    if (already) delete optimisticLikes[uid];
    else optimisticLikes[uid] = true;
    patchPost(post.id, { likes: optimisticLikes });
    fetch(`/api/posts/${post.id}/like`, { method: "POST" })
      .then((res) => {
        if (!res.ok) throw new Error("like failed");
        return res.json().catch(() => null);
      })
      .then((data) => {
        if (data && typeof data.liked === "boolean") {
          setPosts((prev) =>
            prev.map((p) => {
              if (p.id !== post.id) return p;
              const next = { ...(p.likes || {}) };
              if (data.liked) next[uid] = true;
              else delete next[uid];
              return { ...p, likes: next };
            })
          );
        }
      })
      .catch(() => patchPost(post.id, { likes }));
  }

  function toggleBookmark(post) {
    const bookmarks = post.bookmarks || {};
    const already = Boolean(bookmarks[uid]);
    const optimistic = { ...bookmarks };
    if (already) delete optimistic[uid];
    else optimistic[uid] = true;
    patchPost(post.id, { bookmarks: optimistic });
    fetch(`/api/posts/${post.id}/bookmark`, { method: "POST" })
      .then((res) => {
        if (!res.ok) throw new Error("bookmark failed");
        return res.json().catch(() => null);
      })
      .then((data) => {
        if (data && typeof data.bookmarked === "boolean") {
          setPosts((prev) =>
            prev.map((p) => {
              if (p.id !== post.id) return p;
              const next = { ...(p.bookmarks || {}) };
              if (data.bookmarked) next[uid] = true;
              else delete next[uid];
              return { ...p, bookmarks: next };
            })
          );
        }
      })
      .catch(() => patchPost(post.id, { bookmarks }));
  }

  function toggleComments(postId) {
    setOpenComments((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }

  async function handleDelete(postId) {
    if (!window.confirm(t("deleteConfirm") || "Delete this post?")) return;
    const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Failed to delete post");
      return;
    }
    if (showTrash) {
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      return;
    }
    // Soft-deleted: drop it from the feed and offer an undo that restores it.
    const removed = posts.find((p) => p.id === postId);
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setPendingUndo({ postId });
    setTimeout(() => {
      setPendingUndo((cur) => (cur && cur.postId === postId ? null : cur));
    }, 6000);
    return removed;
  }

  async function handleRestore(postId) {
    const res = await fetch(`/api/posts/${postId}/restore`, { method: "POST" });
    if (!res.ok) {
      alert("Could not restore that post.");
      return;
    }
    setPendingUndo(null);
    loadFirst(views);
  }

  async function handleEditSave(postId) {
    if (editBusy) return;
    const next = editText.trim();
    if (!next) return;
    setEditBusy(true);
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Could not save your edit.");
        return;
      }
      patchPost(postId, { text: next, editedAt: Date.now() });
      setEditingId("");
      setEditText("");
    } finally {
      setEditBusy(false);
    }
  }

  async function handleModerate(postId, action) {
    const res = await fetch(`/api/posts/${postId}/moderate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    if (!data) return;
    if (action === "hide" || action === "unhide") {
      if (action === "hide" && postId) setPosts((prev) => prev.filter((p) => p.id !== postId));
      else if (data.hidden === false) patchPost(postId, { hidden: false });
    }
    if (action === "lock") patchPost(postId, { lockedComments: true });
    if (action === "unlock") patchPost(postId, { lockedComments: false });
    if (action === "archive") patchPost(postId, { archived: true });
    if (action === "unarchive") {
      // In the Archived shelf the post no longer belongs in the list at all.
      if (showArchived) setPosts((prev) => prev.filter((p) => p.id !== postId));
      else patchPost(postId, { archived: false });
    }
  }

  async function handleRemoveMedia(postId) {
    if (!window.confirm(t("removeMediaConfirm"))) return;
    const res = await fetch(`/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeMedia: true }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Could not remove the attachment.");
      return;
    }
    patchPost(postId, { imageUrl: "", videoUrl: "", altText: "", editedAt: Date.now() });
    setEditingId("");
    setEditText("");
  }

  async function handleMute(post) {
    const isMuted = mutedIds.has(post.authorId);
    const res = await fetch("/api/members/safety", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: isMuted ? "unmute" : "mute", targetId: post.authorId }),
    });
    if (!res.ok) return;
    setMutedIds((prev) => {
      const next = new Set(prev);
      if (isMuted) next.delete(post.authorId);
      else next.add(post.authorId);
      return next;
    });
    if (!isMuted) setPosts((prev) => prev.filter((p) => p.authorId !== post.authorId));
  }

  async function handleNotifications(post) {
    const res = await fetch(`/api/posts/${post.id}/subscribe`, { method: "POST" });
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));
    const subscribed = typeof data.subscribed === "boolean" ? data.subscribed : !notifIds.has(post.id);
    setNotifIds((prev) => {
      const next = new Set(prev);
      if (subscribed) next.add(post.id);
      else next.delete(post.id);
      return next;
    });
  }

  async function openHistory(post) {
    setHistoryFor(post.id);
    setHistoryItems(null);
    try {
      const res = await fetch(`/api/posts/${post.id}/history`);
      if (res.ok) {
        const data = await res.json();
        setHistoryItems(Array.isArray(data.history) ? data.history : []);
      }
    } catch {
      setHistoryItems([]);
    }
  }

  async function handleRepost(post) {
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "", repostOfId: post.id }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.id) loadFirst(views);
    }
  }

  function handleQuote(post) {
    setQuoteOf(post.id);
    setQuotePreview((post.text || "").slice(0, 140));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function copyPostText(post) {
    const url = `${window.location.origin}/feed?focus=${post.id}`;
    const body = `${post.text || ""}${post.text ? "\n\n" : ""}${url}`;
    try {
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(body);
    } catch {
      /* clipboard blocked */
    }
  }

  async function nativeShare(post) {
    const url = `${window.location.origin}/feed?focus=${post.id}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Community post", text: post.text || "", url });
        return;
      } catch {
        /* user dismissed or share unsupported for this payload */
      }
    }
    sharePost(post.id);
  }

  function toggleTrash() {
    const next = !showTrash;
    setShowTrash(next);
    setShowArchived(false);
    const mode = next ? ["trashed"] : [];
    filterRef.current = mode;
    setViews(mode);
    loadFirst(mode);
  }

  function toggleArchived() {
    const next = !showArchived;
    setShowArchived(next);
    setShowTrash(false);
    const mode = next ? ["archived"] : [];
    filterRef.current = mode;
    setViews(mode);
    loadFirst(mode);
  }

  async function handlePin(postId) {
    const res = await fetch(`/api/posts/${postId}/pin`, { method: "POST" });
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    if (data && typeof data.pinned === "boolean") {
      patchPost(postId, { pinned: data.pinned });
    }
  }

  function prependNewPosts() {
    if (!newPosts.length) return;
    setPosts((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      return sortFeedPosts([...newPosts.filter((p) => !seen.has(p.id)), ...prev]);
    });
    setNewPosts([]);
  }

  const queryText = search.trim().toLowerCase();
  // All filtering, sorting and counts are now server-side. The tabs send their
  // own mode to /api/posts; the search box is a text filter on the current view.

  const postCount = countOf("total") ?? posts.length;
  const followingCount = countOf("following") ?? 0;
  const popularCount = countOf("popular") ?? 0;
  const mineCount = countOf("mine") ?? 0;
  const bookmarkedCount = countOf("bookmarked") ?? 0;
  const unansweredCount = countOf("unanswered") ?? 0;
  const nearCount = countOf("near") ?? 0;

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  const setSearchDebounced = useCallback((value) => {
    setSearch(value);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      loadFirst(filterRef.current);
    }, 400);
  }, [loadFirst]);

  const kindLabel =
    kind === "poll"
      ? t("askAPoll")
      : kind === "question"
        ? t("askAQuestion")
        : kind === "win"
          ? t("askAWin")
          : t("newPost");

  function selectFilter(next) {
    if (showTrash) setShowTrash(false);
    if (showArchived) setShowArchived(false);
    let nextViews;
    if (next === "all") {
      nextViews = [];
    } else {
      nextViews = views.includes(next)
        ? views.filter((v) => v !== next)
        : [...views.filter((v) => v !== "trashed" && v !== "archived"), next];
    }
    setViews(nextViews);
    // Sync the ref synchronously so loadFirst picks up the new view set
    // without waiting for the state effect.
    filterRef.current = nextViews;
    // Every view pill is a server-backed filter (following, near, popular,
    // mine, saved, hosts, unanswered); pills combine with AND and each change
    // fetches its own page keyed by the active set.
    loadFirst(nextViews);
  }

  // Clicking a #tag anywhere in the feed switches the timeline to that tag
  // (ANDed with any active view pills). Cleared via the chip row.
  function selectTag(raw) {
    const next = normalizeTag(raw);
    const clean = isValidTag(next) ? next : "";
    if (clean === tag) return;
    // Mirror the new tag into the ref before the fetch so feedUrlFor reads it,
    // then reload with the current view set (no ref read during render).
    tagRef.current = clean;
    setTag(clean);
    loadFirst(views);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function sharePost(id) {
    const url = `${window.location.origin}/feed?focus=${id}`;
    try {
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url);
    } catch {
      /* clipboard blocked — still show the happy path */
    }
    setCopiedIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setCopiedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 1600);
  }

  function clearDraft() {
    try {
      localStorage.removeItem(`feed:draft:${uid}:${groupId || spaceId || "home"}`);
    } catch {}
    setDraftRestored(false);
    setText("");
    setKind("post");
    setPollOptions(EMPTY_POLL);
    setPollDeadline("");
    setVideoUrl("");
    setShowVideoInput(false);
  }

  const disabledActions = !canWriteChat && !canModerate;

  async function toggleArticleLike(post) {
    if (disabledActions) return;
    const realId = (post.id || "").split(":")[1];
    if (!realId) return;
    try {
      const res = await fetch(`/api/articles/${realId}/like`, { method: "POST" });
      if (!res.ok) return;
      const data = await res.json();
      const next = { ...(post.likes || {}) };
      if (data.liked) next[uid] = new Date().toISOString();
      else delete next[uid];
      patchPost(post.id, { likes: next });
    } catch {
      /* best-effort */
    }
  }

  function renderArticleCard(post) {
    const realId = (post.id || "").split(":")[1] || "";
    return (
      <article key={`article:${realId}`} className={styles.post} style={postCardStyle("article")}>
        <div className={styles.postHeader}>
          <div className={styles.avatar}>
            {(post.authorName || "?").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <p className={styles.postAuthor}>
              {post.authorName}
              <span className={styles.kindBadge}><FileText size={13} /> {t("article")}</span>
            </p>
            <p className={styles.postTime}>{timeAgo(post.createdAt)}</p>
          </div>
        </div>
        {post.coverImage && (
          <img src={post.coverImage} alt="" className={styles.postImage} loading="lazy" decoding="async" />
        )}
        <p className={styles.cardTitle}>{post.title}</p>
        {post.text && <p className={styles.postText}>{post.text}</p>}
        <p className={styles.cardMeta}>{t("readTime", { count: post.readTime || 1 })}</p>
        <div className={styles.postActions}>
          <LikeButton likes={post.likes} uid={uid} disabled={disabledActions} onToggle={() => toggleArticleLike(post)} />
          <a className={styles.cardLink} href={`/articles/${realId}`}>
            {t("readArticle")}
          </a>
        </div>
      </article>
    );
  }

  function renderEventCard(post) {
    const realId = (post.id || "").split(":")[1] || "";
    const start = post.startTime ? new Date(post.startTime) : null;
    const dateLabel = start
      ? start.toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "";
    return (
      <article key={`event:${realId}`} className={styles.post} style={postCardStyle("event")}>
        <div className={styles.postHeader}>
          <div className={styles.avatar}>
            {(post.authorName || "?").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <p className={styles.postAuthor}>
              {post.authorName}
              <span className={styles.kindBadge}><CalendarDays size={13} /> {t("event")}</span>
            </p>
            <p className={styles.postTime}>
              {dateLabel}
              {post.roomSlug ? <span className={styles.postPlace}> · {post.roomSlug}</span> : null}
            </p>
          </div>
        </div>
        <p className={styles.cardTitle}>{post.title}</p>
        <div className={styles.postActions}>
          <a className={styles.cardLink} href={`/events/${realId}`}>
            {t("rsvp")}
          </a>
        </div>
      </article>
    );
  }

  function renderPost(post) {
    if (post.kind === "article") return renderArticleCard(post);
    if (post.kind === "event") return renderEventCard(post);
    const attribution = post.spaceName ? post.spaceName : post.groupName ? post.groupName : null;
    const canEditPost = !isSystemPost(post) && (post.authorId === uid || canModerate);
    const menuItems = showTrash
      ? [
          {
            key: "restore",
            label: t("restore"),
            icon: <RotateCcw size={15} />,
            onClick: () => handleRestore(post.id),
          },
        ]
      : showArchived
      ? [
          {
            key: "unarchive",
            label: t("unarchivePost"),
            icon: <Archive size={15} />,
            onClick: () => handleModerate(post.id, "unarchive"),
          },
          {
            key: "delete",
            label: t("delete"),
            icon: <Trash2 size={15} />,
            onClick: () => handleDelete(post.id),
            danger: true,
          },
        ]
      : [
          canEditPost &&
            post.kind !== "poll" && {
              key: "edit",
              label: t("editPost"),
              icon: <Pencil size={15} />,
              onClick: () => {
                setEditingId(post.id);
                setEditText(post.text || "");
              },
            },
          post.editedAt && {
            key: "history",
            label: t("viewEditHistory"),
            icon: <History size={15} />,
            onClick: () => openHistory(post),
          },
          {
            key: "copytext",
            label: t("copyText"),
            icon: <FileText size={15} />,
            onClick: () => copyPostText(post),
          },
          {
            key: "notify",
            label: notifIds.has(post.id) ? t("turnOffNotifications") : t("turnOnNotifications"),
            icon: notifIds.has(post.id) ? <BellOff size={15} /> : <Bell size={15} />,
            onClick: () => handleNotifications(post),
          },
          post.authorId !== uid && {
            key: "mute",
            label: mutedIds.has(post.authorId) ? t("unmuteAuthor") : t("muteAuthor"),
            icon: <VolumeX size={15} />,
            onClick: () => handleMute(post),
          },
          canModerate && {
            key: "hide",
            label: t("hidePost"),
            icon: <EyeOff size={15} />,
            onClick: () => handleModerate(post.id, "hide"),
          },
          canModerate && {
            key: "lock",
            label: post.lockedComments ? t("unlockComments") : t("lockComments"),
            icon: post.lockedComments ? <Unlock size={15} /> : <Lock size={15} />,
            onClick: () => handleModerate(post.id, post.lockedComments ? "unlock" : "lock"),
          },
          (post.authorId === uid || canModerate) && {
            key: "archive",
            label: t("archivePost"),
            icon: <Archive size={15} />,
            onClick: () => handleModerate(post.id, "archive"),
          },
          (post.authorId === uid || (canModerate && !isSystemPost(post))) && {
            key: "delete",
            label: t("delete"),
            icon: <Trash2 size={15} />,
            onClick: () => handleDelete(post.id),
            danger: true,
          },
        ];
    return (
      <article key={post.id} id={`feed-post-${post.id}`} className={styles.post} style={postCardStyle(post.kind)}>
        <div className={styles.postHeader}>
          <div className={styles.avatar}>
            {post.authorPhotoUrl ? (
              <img src={post.authorPhotoUrl} alt="" className={styles.avatarImg} loading="lazy" decoding="async" />
            ) : (
              (post.authorName || "?").slice(0, 1).toUpperCase()
            )}
          </div>
          <div className={styles.postHeaderInfo}>
            <p className={styles.postAuthor}>
              {isSystemPost(post) ? (
                post.authorName
              ) : (
                <Link
                  className={styles.authorLink}
                  href={`/members?search=${encodeURIComponent(post.authorUsername || post.authorName || "")}`}
                >
                  {post.authorName}
                </Link>
              )}
              {!isSystemPost(post) && (post.authorRole === "owner" || post.authorRole === "moderator") && (
                <span className={styles.roleTag}><Crown size={12} /> {t("host")}</span>
              )}
              {post.kind === "announcement" && <span className={styles.kindBadge}><ScrollText size={13} /> {t("announcement")}</span>}
              {post.kind === "poll" && <span className={styles.kindBadge}><BarChart3 size={13} /> {t("tabPoll")}</span>}
              {post.kind === "question" && <span className={styles.kindBadge}><HelpCircle size={13} /> {t("tabQuestion")}</span>}
              {post.kind === "win" && <span className={styles.kindBadge}><Trophy size={13} /> {t("tabWin")}</span>}
              {(post.archived || post.archivedAt) ? <span className={styles.kindBadge}><Archive size={13} /> {t("archived")}</span> : null}
              {post.pinned && <span className={styles.pinnedBadge}><Pin size={13} /> {t("pinned")}</span>}
            </p>
            <p className={styles.postTime}>
              {post.scheduledAt ? (
                <span className={styles.postPlace}><Clock size={12} /> {t("scheduledFor", { when: new Date(post.scheduledAt).toLocaleString() })}</span>
              ) : (
                timeAgo(post.createdAt)
              )}
              {post.editedAt ? <span className={styles.postPlace}> · {t("edited")}</span> : null}
              {attribution && <span className={styles.postPlace}> · {attribution}</span>}
            </p>
          </div>
          <div className={styles.postHeaderActions}>
            {canModerate && !showTrash && (
              <button
                className={styles.pinBtn}
                onClick={() => handlePin(post.id)}
                title={post.pinned ? t("unpinPost") : t("pinPost")}
              >
                {post.pinned ? t("unpin") : t("pin")}
              </button>
            )}
            <PostMenu items={menuItems} title={t("moreActions")} />
            {!showTrash && post.authorId !== uid && !isSystemPost(post) && (
              <ReportButton type="post" targetId={post.id} />
            )}
          </div>
        </div>
        {editingId === post.id ? (
          <div className={styles.editBox}>
            <textarea
              className={styles.composerInput}
              rows={3}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
            />
            <div className={styles.postActions}>
              <button type="button" className={styles.shareBtn} disabled={editBusy} onClick={() => handleEditSave(post.id)}>
                {t("save")}
              </button>
              <button
                type="button"
                className={styles.shareBtn}
                onClick={() => {
                  setEditingId("");
                  setEditText("");
                }}
              >
                {t("cancel")}
              </button>
              {(post.imageUrl || post.videoUrl) && (
                <button
                  type="button"
                  className={styles.shareBtn}
                  onClick={() => handleRemoveMedia(post.id)}
                >
                  {t("removeMedia")}
                </button>
              )}
            </div>
          </div>
        ) : (
          post.text && (
            <p className={styles.postText}>
              {renderMentions(post.text, selectTag)}
              {post.sensitive && <span className={styles.postPlace}> · {t("markedSensitive")}</span>}
            </p>
          )
        )}
        {post.quoteOfId && <p className={styles.quoteRef}>{t("quotedPost")}</p>}
        {post.kind === "poll" && (
          <PollBlock postId={post.id} post={post} uid={uid} disabled={disabledActions} />
        )}
        {post.imageUrl && (
          <img src={post.imageUrl} alt={post.altText || ""} className={styles.postImage} loading="lazy" decoding="async" />
        )}
        {post.videoUrl && <VideoEmbed post={post} />}
        {isSystemPost(post) ? (
          <p className={styles.readOnlyNote}>{t("readOnlyNote")}</p>
        ) : (
          <>
            <div className={styles.postActions}>
              <LikeButton likes={post.likes} uid={uid} disabled={disabledActions} onToggle={() => toggleLike(post)} />
              <BookmarkButton bookmarks={post.bookmarks} uid={uid} disabled={disabledActions} onToggle={() => toggleBookmark(post)} />
              <button
                type="button"
                className={`${styles.commentToggle}${openComments.has(post.id) ? ` ${styles.commentToggleOpen}` : ""}`}
                onClick={() => toggleComments(post.id)}
                aria-expanded={openComments.has(post.id)}
              >
                <MessageCircle size={15} />
                {t("commentsCount", { count: post.commentCount || 0 })}
              </button>
              <button
                type="button"
                className={styles.shareBtn}
                onClick={() => handleRepost(post)}
                title={t("repost")}
              >
                <Repeat2 size={15} />
                {t("repost")}
              </button>
              <button
                type="button"
                className={styles.shareBtn}
                onClick={() => handleQuote(post)}
                title={t("quotePost")}
              >
                <Quote size={15} />
                {t("quote")}
              </button>
              <button
                type="button"
                className={styles.shareBtn}
                onClick={() => nativeShare(post)}
                title={t("share")}
              >
                <Share2 size={15} />
                {copiedIds.has(post.id) ? t("copied") : t("share")}
              </button>
            </div>
            <EmojiReactionBar postId={post.id} reactions={post.reactions} uid={uid} disabled={disabledActions} onUpdated={(map) => patchPost(post.id, { reactions: map })} />
            {openComments.has(post.id) && (
              <CommentList postId={post.id} uid={uid} userName={userName} userPhotoURL={userPhotoURL} role={role} canModerate={canModerate} disabled={disabledActions} locked={post.lockedComments && !canModerate} onCommentChanged={patchCommentCount} onTag={selectTag} />
            )}
          </>
        )}
      </article>
    );
  }

  function renderFeaturedPost(post) {
    const isSystemPin = post.pinned && isSystemPost(post);
    const engagement =
      Object.keys(post.likes || {}).length +
      Object.keys(post.reactions || {}).length +
      (post.commentCount || 0) +
      (post.pollTotal || 0);
    return (
      <article key={post.id} className={styles.featuredCard}>
        <p className={styles.featuredHead}>
          <span className={styles.featuredName}>{post.authorName || "Member"}</span>
          {post.pinned && <span className={styles.featuredPin}>{t("pinned")}</span>}
        </p>
        {post.text && <p className={styles.featuredText}>{post.text}</p>}
        <p className={styles.featuredMeta}>
          {isSystemPin
            ? t("featuredReadOnly")
            : t("featuredReactions", { count: engagement })}
        </p>
      </article>
    );
  }

  const virtualize = posts.length > VIRTUALIZE_AT;
  const windowVirtualizer = useWindowVirtualizer({
    count: posts.length,
    estimateSize: () => 320,
    overscan: 6,
  });

  return (
    <div
      className={`${styles.feedLayout} ${
        !groupId && !spaceId ? styles.feedLayoutWithRail : ""
      }`}
    >
      <div className={styles.feed}>
      {!canWriteChat && !canModerate ? (
        <div className={styles.upgradePrompt}>
          <svg className={styles.upgradePromptIcon} viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>{t("upgradeToChat")}</span>
          <a className={styles.upgradePromptLink} href={UPGRADE_URL} target="_blank" rel="noopener noreferrer">
            {t("upgrade")}
          </a>
        </div>
      ) : (
      <form className={styles.composer} onSubmit={handlePost}>
        <div className={styles.kindTabs}>
          {[
            { key: "post", icon: <PenSquare size={14} />, label: t("tabPost") },
            { key: "poll", icon: <BarChart3 size={14} />, label: t("tabPoll") },
            { key: "question", icon: <HelpCircle size={14} />, label: t("tabQuestion") },
            { key: "win", icon: <Trophy size={14} />, label: t("tabWin") },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={kind === tab.key ? styles.kindTabActive : styles.kindTab}
              onClick={() => setKind(tab.key)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
        <MentionInput
          className={styles.composerInput}
          rows={3}
          withTags
          placeholder={
            kind === "poll"
              ? t("askPoll")
              : kind === "question"
                ? t("askQuestion")
                : kind === "win"
                  ? t("askWin")
                  : t("writePost")
          }
          value={text}
          onChange={setText}
          maxLength={5000}
        />
        {kind === "poll" && (
          <div className={styles.pollComposer}>
            {pollOptions.map((option, index) => (
              <div key={index} className={styles.pollOptionRow}>
                <input
                  className={styles.pollOptionInput}
                  type="text"
                  placeholder={t("optionNumber", { number: index + 1 })}
                  value={option}
                  maxLength={100}
                  onChange={(e) => setPollOption(index, e.target.value)}
                />
                {pollOptions.length > 2 && (
                  <button
                    type="button"
                    className={styles.pollRemove}
                    onClick={() => removePollOption(index)}
                    aria-label={t("removeOption")}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {pollOptions.length < 5 && (
              <button type="button" className={styles.pollAdd} onClick={addPollOption}>
                {t("addOption")}
              </button>
            )}
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#6b6b7b", display: "block", marginBottom: 4 }}>
                {t("deadlineOptional")}
              </label>
              <input
                type="datetime-local"
                className={styles.pollOptionInput}
                value={pollDeadline}
                onChange={(e) => setPollDeadline(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                style={{ maxWidth: 260 }}
              />
            </div>
          </div>
        )}
        {imageUrl && (
          <div className={styles.imagePreview}>
            <img src={imageUrl} alt="Attached" className={styles.imagePreviewImg} />
            <button
              type="button"
              className={styles.removeImage}
              onClick={() => setImageUrl("")}
            >
              {t("remove")}
            </button>
          </div>
        )}
        {kind !== "poll" && showVideoInput && (
          <div className={styles.videoComposer}>
            <input
              className={styles.videoUrlInput}
              type="url"
              placeholder={t("videoUrlPlaceholder")}
              value={videoUrl}
              maxLength={2048}
              onChange={(e) => setVideoUrl(e.target.value.trim())}
            />
            {videoUrl && imageUrl && (
              <p className={styles.videoComposerWarn}>{t("noImageAndVideo")}</p>
            )}
            {videoUrl && !imageUrl && (
              <p className={styles.videoDetected}>
                {t("videoDetected")} {embedInfoForUrl(videoUrl).host || t("videoDetectedUnknown")}
              </p>
            )}
            <button
              type="button"
              className={styles.removeImage}
              onClick={() => {
                setVideoUrl("");
                setShowVideoInput(false);
              }}
            >
              {t("remove")}
            </button>
          </div>
        )}
        {quoteOf && (
          <div className={styles.quoteChip}>
            <Quote size={14} />
            <span>{t("quotingPost")}</span>
            {quotePreview ? <span className={styles.quotePreviewText}>{quotePreview}</span> : null}
            <button
              type="button"
              className={styles.draftClear}
              onClick={() => {
                setQuoteOf("");
                setQuotePreview("");
              }}
            >
              {t("remove")}
            </button>
          </div>
        )}
        {imageUrl && (
          <div style={{ marginTop: 8 }}>
            <input
              className={styles.videoUrlInput}
              type="text"
              maxLength={280}
              placeholder={t("altTextPlaceholder")}
              value={composerAlt}
              onChange={(e) => setComposerAlt(e.target.value)}
            />
          </div>
        )}
        <div className={styles.composerRow}>
          <div className={styles.composerLeft}>
            <button
              type="button"
              className={styles.uploadBtn}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || Boolean(videoUrl)}
            >
              {uploading ? t("uploading") : t("addPhoto")}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleImageUpload}
            />
            {kind !== "poll" && (
              <button
                type="button"
                className={`${showVideoInput ? styles.videoBtnActive : styles.uploadBtn}`}
                onClick={() => setShowVideoInput((v) => !v)}
                disabled={Boolean(imageUrl)}
              >
                <Video size={14} /> {t("addVideo")}
              </button>
            )}
            <button
              type="button"
              className={styles.moreOptionsButton}
              onClick={() => setShowComposerOptions((open) => !open)}
              aria-expanded={showComposerOptions}
              aria-controls="feed-composer-options"
            >
              {t("moreOptions")}
              <ChevronDown
                size={14}
                className={showComposerOptions ? styles.moreOptionsChevronOpen : ""}
              />
            </button>
          </div>
          <button
            className={styles.postButton}
            type="submit"
            disabled={
              busy ||
              uploading ||
              (kind === "poll"
                ? pollOptions.filter((opt) => opt.trim().length > 0).length < 2
                : !text.trim() && !imageUrl && !videoUrl)
            }
          >
            {busy ? t("posting") : kindLabel}
          </button>
        </div>
        {showComposerOptions && (
          <div className={styles.composerExtraOptions} id="feed-composer-options">
            <label className={styles.composerOption}>
              <input
                type="checkbox"
                checked={composerSensitive}
                onChange={(e) => setComposerSensitive(e.target.checked)}
              />
              {t("markSensitive")}
            </label>
            <label className={styles.composerOption}>
              <span className={styles.composerOptionLabel}>
                <Clock size={14} /> {t("scheduleFor")}
              </span>
              <input
                type="datetime-local"
                className={styles.pollOptionInput}
                value={composerSchedule}
                onChange={(e) => setComposerSchedule(e.target.value)}
                style={{ maxWidth: 210 }}
              />
            </label>
          </div>
        )}
        <p className={styles.composerHint}>{t("beKind")}</p>
        {draftRestored && (
          <div className={styles.draftRestored}>
            <span>{t("draftRestored")}</span>
            <button type="button" className={styles.draftClear} onClick={clearDraft}>
              {t("clearDraft")}
            </button>
          </div>
        )}
      </form>
      )}

      <div className={styles.feedBar}>
        <input
          className={styles.search}
          type="search"
          placeholder={t("searchPosts")}
          value={search}
          onChange={(e) => setSearchDebounced(e.target.value)}
        />
        <div className={styles.filterTabs}>
          <button
            className={views.length === 0 ? styles.filterTabActive : styles.filterTab}
            onClick={() => selectFilter("all")}
            aria-pressed={views.length === 0}
          >
            {t("all", { count: postCount })}
          </button>
          {!groupId && !spaceId && (
            <button
              className={views.includes("following") ? styles.filterTabActive : styles.filterTab}
              onClick={() => selectFilter("following")}
              aria-pressed={views.includes("following")}
            >
              {t("following", { count: followingCount })}
            </button>
          )}
          {!groupId && !spaceId && (
            <button
              className={views.includes("near") ? styles.filterTabActive : styles.filterTab}
              onClick={() => selectFilter("near")}
              aria-pressed={views.includes("near")}
            >
              {t("nearYou", { count: nearCount })}
            </button>
          )}
          <button
            className={views.includes("popular") ? styles.filterTabActive : styles.filterTab}
            onClick={() => selectFilter("popular")}
            aria-pressed={views.includes("popular")}
          >
            {t("popular", { count: popularCount })}
          </button>
          <button
            className={views.includes("mine") ? styles.filterTabActive : styles.filterTab}
            onClick={() => selectFilter("mine")}
            aria-pressed={views.includes("mine")}
          >
            {t("mine", { count: mineCount })}
          </button>
          <button
            className={views.includes("bookmarked") ? styles.filterTabActive : styles.filterTab}
            onClick={() => selectFilter("bookmarked")}
            aria-pressed={views.includes("bookmarked")}
          >
            {t("saved", { count: bookmarkedCount })}
          </button>
          <button
            className={views.includes("hosts") ? styles.filterTabActive : styles.filterTab}
            onClick={() => selectFilter("hosts")}
            aria-pressed={views.includes("hosts")}
          >
            {t("hosts")}
          </button>
          <button
            className={views.includes("unanswered") ? styles.filterTabActive : styles.filterTab}
            onClick={() => selectFilter("unanswered")}
            aria-pressed={views.includes("unanswered")}
          >
            {t("unanswered", { count: unansweredCount })}
          </button>
          {!groupId && !spaceId && (
            <button
              className={showTrash ? styles.filterTabActive : styles.filterTab}
              onClick={toggleTrash}
              aria-pressed={showTrash}
            >
              <Trash2 size={13} /> {t("trash")}
            </button>
          )}
          {!groupId && !spaceId && (
            <button
              className={showArchived ? styles.filterTabActive : styles.filterTab}
              onClick={toggleArchived}
              aria-pressed={showArchived}
            >
              <Archive size={13} /> {t("archived")}
            </button>
          )}
        </div>
        <div className={styles.sortTabs}>
          <select
            className={styles.sortSelect}
            value={sort}
            onChange={(e) => changeSort(e.target.value)}
          >
            <option value="newest">{t("sortNewest")}</option>
            <option value="oldest">{t("sortOldest")}</option>
            <option value="top">{t("sortTop")}</option>
            <option value="activity">{t("sortLatestActivity")}</option>
          </select>
        </div>
      </div>

      {tag && (
        <div className={styles.tagChipRow}>
          <span className={styles.tagChip}>
            #{tag}
            <button
              type="button"
              className={styles.tagChipClear}
              onClick={() => selectTag("")}
              aria-label={t("clearTag")}
            >
              <X size={14} />
            </button>
          </span>
        </div>
      )}

      {newPosts.length > 0 && (
        <button className={styles.newPostsBanner} type="button" onClick={prependNewPosts}>
          {t("newPosts", { count: newPosts.length })}
        </button>
      )}

      {initialLoading ? (
        <div className={styles.postList} aria-busy="true">
          <PostSkeleton showActions />
          <PostSkeleton showActions />
          <PostSkeleton showActions />
        </div>
      ) : loadError && posts.length === 0 ? (
        <div className={styles.feedError} role="alert">
          <p>{t("loadError")}</p>
          <button className={styles.retryBtn} type="button" onClick={() => loadFirst()}>
            {t("retry")}
          </button>
        </div>
      ) : posts.length === 0 ? (
        <p className={styles.empty}>
          {queryText
            ? t("noPostsSearch")
            : views.includes("following")
            ? t("noPostsFollowing")
            : views.includes("near")
            ? t("noPostsNear")
            : tag
            ? t("noPostsTag", { tag })
            : spaceId
            ? t("noPostsSpace")
            : groupId
            ? t("noPostsGroup")
            : t("noPosts")}
        </p>
      ) : (
        <div className={styles.postList} role="feed" aria-busy={loadingMore} aria-label={t("title")}>
          {virtualize ? (
            <div style={{ height: windowVirtualizer.getTotalSize(), position: "relative" }}>
              {/* TanStack Virtual keeps its measurements in a ref-backed store and
                  only exposes them through accessor methods, so reading them here
                  during render is the library's intended usage. The compiler's refs
                  heuristic cannot see through that API. */}
              {/* eslint-disable-next-line react-hooks/refs */}
              {windowVirtualizer.getVirtualItems().map((vi) => (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  ref={windowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  {renderPost(posts[vi.index])}
                </div>
              ))}
            </div>
          ) : (
            /* renderPost closes over the stable refs this feed is built around
               (tagRef / filterRef). They are only written in event handlers, never
               read during render; the compiler's heuristic cannot prove that. */
            /* eslint-disable-next-line react-hooks/refs */
            posts.map((post) => renderPost(post))
          )}

          {!hasMore && posts.length > 0 && (
            <p className={styles.feedEnd}>{t("allCaughtUp")}</p>
          )}

          {loadMoreError && (
            <div className={styles.feedMoreError} role="alert">
              <span>{t("couldNotLoadMore")}</span>
              <button className={styles.retryBtn} type="button" onClick={loadMore}>
                {t("retry")}
              </button>
            </div>
          )}

          {hasMore && (
            <button className={styles.loadMoreBtn} type="button" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? t("loadingMore") : t("loadMore")}
            </button>
          )}

          <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
          {loadingMore && (
            <div className={styles.postList}>
              <PostSkeleton showActions />
            </div>
          )}
        </div>
      )}

      <p data-feed-live aria-live="polite" className={styles.liveRegion} />
      </div>
      {pendingUndo && (
        <div className={styles.undoToast} role="status">
          <span>{t("movedToTrash")}</span>
          <button type="button" className={styles.undoBtn} onClick={() => handleRestore(pendingUndo.postId)}>
            {t("undo")}
          </button>
        </div>
      )}
      {historyFor && (
        <div
          className={styles.modalOverlay}
          onClick={() => {
            setHistoryFor("");
            setHistoryItems(null);
          }}
        >
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <strong>{t("editHistoryTitle")}</strong>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => {
                  setHistoryFor("");
                  setHistoryItems(null);
                }}
              >
                <X size={16} />
              </button>
            </div>
            {historyItems === null ? (
              <p>{t("loading")}</p>
            ) : historyItems.length === 0 ? (
              <p>{t("noEditHistory")}</p>
            ) : (
              <ul className={styles.modalList}>
                {historyItems.map((h, i) => (
                  <li key={h.id || i}>
                    <p className={styles.modalHistoryText}>{h.text}</p>
                    <span className={styles.modalHistoryMeta}>
                      {h.editorName || ""} {h.createdAt ? `· ${timeAgo(h.createdAt)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {!groupId && !spaceId && (
        <aside className={styles.rail} aria-label={t("featured")}>
          <h2 className={styles.railTitle}>{t("featured")}</h2>
          {featured.length === 0 ? (
            <p className={styles.railEmpty}>{t("featuredEmpty")}</p>
          ) : (
            featured.map((post) => renderFeaturedPost(post))
          )}
        </aside>
      )}
    </div>
  );
}