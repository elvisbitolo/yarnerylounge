"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import { UPGRADE_URL } from "@/lib/upgrade-url";
import ReportModal from "./ReportModal";
import MentionInput from "@/components/MentionInput";
import { cardThemeVars } from "@/lib/card-themes";
import styles from "./feed.module.css";

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

function timeAgo(ts) {
  if (!ts) return "";
  const millis = typeof ts.toMillis === "function" ? ts.toMillis() : Number(ts);
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

function renderMentions(text) {
  if (!text) return "";
  const parts = text.split(/(@[a-zA-Z0-9_]{1,30})/g);
  return parts.map((part, index) => {
    const match = part.match(/^@([a-zA-Z0-9_]{1,30})$/);
    if (!match) return renderHashtags(part);
    const username = match[1];
    return (
      <Link key={index} className={styles.mention} href={`/members?search=${encodeURIComponent(username)}`}>
        @{username}
      </Link>
    );
  });
}

function renderHashtags(text) {
  if (!text) return "";
  const parts = text.split(/((?:^|\s)#[a-zA-Z0-9_]+)/g);
  return parts.map((part, index) => {
    const match = part.match(/^(\s*)#([a-zA-Z0-9_]+)$/);
    if (!match) return part;
    const [, space, tag] = match;
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

function LikeButton({ postId, likes, uid, disabled }) {
  const t = useTranslations("feed");
  const [count, setCount] = useState(Object.keys(likes || {}).length);
  const [liked, setLiked] = useState(!!likes?.[uid]);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/posts/${postId}/like`, { method: "POST" });
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
      className={`${styles.like} ${liked ? styles.likeActive : ""}`}
      onClick={toggle}
      disabled={busy || disabled}
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

function EmojiReactionBar({ postId, commentId, reactions, uid, disabled }) {
  const t = useTranslations("feed");
  const current = reactions || {};
  const reactionEntries = Object.entries(current).map(([emoji, users]) => ({
    emoji,
    count: Object.keys(users || {}).length,
    mine: Boolean(users?.[uid]),
  }));
  const [list, setList] = useState(reactionEntries.filter((r) => r.count > 0));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggle(emoji) {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const path = commentId
        ? `/api/posts/${postId}/comments/${commentId}/reactions`
        : `/api/posts/${postId}/reactions`;
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (res.ok) {
        const data = await res.json();
        setList((data.reactions || []).filter((r) => r.count > 0));
      }
    } catch (err) {
      console.error("Reaction failed", err);
    } finally {
      setBusy(false);
    }
  }

  const mine = (emoji) => {
    const entry = list.find((r) => r.emoji === emoji);
    return entry ? entry.mine : false;
  };

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
        ☺
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

function BookmarkButton({ postId, bookmarks, uid, disabled }) {
  const t = useTranslations("feed");
  const [bookmarked, setBookmarked] = useState(!!bookmarks?.[uid]);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/posts/${postId}/bookmark`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setBookmarked(data.bookmarked);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className={`${styles.bookmark} ${bookmarked ? styles.bookmarkActive : ""}`}
      onClick={toggle}
      disabled={busy || disabled}
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

function CommentList({ postId, uid, canModerate, disabled }) {
  const t = useTranslations("feed");
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    let timer;
    const load = async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/comments`);
        if (!res.ok) return;
        const data = await res.json();
        if (active) setComments(data.comments || []);
      } catch {
        /* keep polling */
      }
    };
    load();
    timer = setInterval(load, 20000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [postId, version]);

  async function handleAdd(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({})))?.error) || "Reply failed");
      setText("");
      setVersion((v) => v + 1);
    } catch (err) {
      console.error(err);
    } finally {
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
    }
  }

  return (
    <div className={styles.comments}>
      {comments.length > 0 && (
        <div className={styles.commentList}>
          {comments.map((c) => (
            <div key={c.id} className={styles.comment}>
              <div className={styles.commentHeader}>
                <span className={styles.commentName}>{c.authorName}</span>
                <span className={styles.commentTime}>{timeAgo(c.createdAt)}</span>
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
              <p className={styles.commentText}>{renderMentions(c.text)}</p>
              <EmojiReactionBar
                postId={postId}
                commentId={c.id}
                reactions={c.reactions}
                uid={uid}
                disabled={disabled}
              />
            </div>
          ))}
        </div>
      )}
      <form className={styles.commentForm} onSubmit={handleAdd}>
        <input
          className={styles.commentInput}
          type="text"
          placeholder={disabled ? t("upgradeToChat") : t("replyPlaceholder")}
          value={text}
          disabled={disabled}
          readOnly={disabled}
          onChange={(e) => setText(e.target.value)}
        />
        <button className={styles.commentSubmit} type="submit" disabled={disabled || !text.trim() || busy}>
          {disabled ? t("upgrade") : busy ? t("replying") : t("reply")}
        </button>
      </form>
    </div>
  );
}

const EMPTY_POLL = ["", ""];

export default function Feed({ uid, userName, role, groupId, spaceId, initialKind, canWriteChat = false }) {
  const t = useTranslations("feed");
  const canModerate = role === "owner" || role === "moderator";
  const [posts, setPosts] = useState([]);
  const [loadError, setLoadError] = useState(false);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [kind, setKind] = useState(
    initialKind === "poll" || initialKind === "question" || initialKind === "win"
      ? initialKind
      : "post"
  );
  const [pollOptions, setPollOptions] = useState(EMPTY_POLL);
  const [pollDeadline, setPollDeadline] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [followingCount, setFollowingCount] = useState(0);
  const [nearCount, setNearCount] = useState(0);
  const fileInputRef = useRef(null);

  const sortFeedPosts = useCallback(
    (list) =>
      [...list].sort((a, b) => {
        const ap = a.pinned ? 1 : 0;
        const bp = b.pinned ? 1 : 0;
        if (ap !== bp) return bp - ap;
        const at = a.createdAt?.toMillis?.() || Number(a.createdAt) || 0;
        const bt = b.createdAt?.toMillis?.() || Number(b.createdAt) || 0;
        return bt - at;
      }),
    []
  );

  const loadCommunityPosts = useCallback(async (modeOverride) => {
    const mode = typeof modeOverride === "string" ? modeOverride : filter;
    let query = "";
    if (mode === "following") query = "?following=1";
    else if (mode === "near") query = "?near=1";
    try {
      const res = await fetch(`/api/posts${query}`);
      if (!res.ok) throw new Error("Feed read failed");
      const data = await res.json();
      setPosts(sortFeedPosts(data.posts || []));
      setLoadError(false);
      if (mode === "following") setFollowingCount(sortFeedPosts(data.posts || []).filter((p) => p.authorId !== uid).length);
      if (mode === "near") setNearCount(sortFeedPosts(data.posts || []).filter((p) => p.authorId !== uid).length);
    } catch (err) {
      console.error("Feed read failed", err);
      setLoadError(true);
    }
  }, [sortFeedPosts, filter, uid]);

  function selectFilter(next) {
    const prev = filter;
    setFilter(next);
    if (!groupId && !spaceId && next !== prev) {
      loadCommunityPosts(next);
    }
  }

  useEffect(() => {
    const isCommunity = !groupId && !spaceId;
    const load = async () => {
      if (isCommunity) {
        loadCommunityPosts();
        return;
      }
      const params = new URLSearchParams();
      if (spaceId) params.set("spaceId", spaceId);
      if (groupId) params.set("groupId", groupId);
      try {
        const res = await fetch(`/api/posts?${params.toString()}`);
        if (!res.ok) throw new Error("Feed read failed");
        const data = await res.json();
        setPosts(sortFeedPosts(data.posts || []));
        setLoadError(false);
      } catch (err) {
        console.error("Feed read failed", err);
        setLoadError(true);
      }
    };
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so the fresh session cookie is sent
        window.location.assign("/login");
        return;
      }
      load();
    });

    load();
    const interval = setInterval(load, 25000);
    return () => {
      clearInterval(interval);
      unsubAuth();
    };
  }, [groupId, spaceId, loadCommunityPosts, sortFeedPosts]);

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
      if (dataUrl.length > 700_000) {
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
      const tag = /\b#win\b/i.test(trimmed) ? "" : "#win";
      const payloadText = kind === "win" && trimmed ? `${trimmed} ${tag}`.trim() : trimmed;
      const cleanPoll = pollOptions
        .map((opt) => opt.trim())
        .filter((opt) => opt.length > 0);
      if (kind === "poll") {
        if (cleanPoll.length < 2 || busy || uploading) return;
      } else if ((!trimmed && !imageUrl) || busy || uploading) {
        return;
      }
      setBusy(true);
      try {
        const res = await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: payloadText,
            imageUrl,
            groupId: groupId || "",
            spaceId: spaceId || "",
            kind,
            pollOptions: kind === "poll" ? cleanPoll : [],
            pollDeadline: kind === "poll" && pollDeadline ? pollDeadline : "",
          }),
        });
        if (!res.ok) throw new Error(((await res.json().catch(() => ({})))?.error) || "Post failed");
        setText("");
        setImageUrl("");
        setKind("post");
        setPollOptions(EMPTY_POLL);
        setPollDeadline("");
        if (!spaceId && !groupId) loadCommunityPosts();
      } catch (err) {
        console.error(err);
        alert(err.message || "Post failed. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [text, imageUrl, busy, uploading, groupId, spaceId, kind, pollOptions, pollDeadline, loadCommunityPosts]
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

  async function handleDelete(postId) {
    const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Failed to delete post");
    }
  }

  async function handlePin(postId) {
    await fetch(`/api/posts/${postId}/pin`, { method: "POST" });
  }

  const queryText = search.trim().toLowerCase();
  let filtered = posts;
  if (queryText) {
    filtered = filtered.filter(
      (p) =>
        p.text?.toLowerCase().includes(queryText) ||
        p.authorName?.toLowerCase().includes(queryText) ||
        (p.pollOptions || []).some((opt) => opt.toLowerCase().includes(queryText))
    );
  }
  if (filter === "popular") {
    filtered = [...filtered].sort(
      (a, b) => Object.keys(b.likes || {}).length - Object.keys(a.likes || {}).length
    );
  } else if (filter === "mine") {
    filtered = filtered.filter((p) => p.authorId === uid);
  } else if (filter === "bookmarked") {
    filtered = filtered.filter((p) => p.bookmarks?.[uid]);
  } else if (filter === "hosts") {
    filtered = filtered.filter((p) => p.authorRole === "owner" || p.authorRole === "moderator");
  } else if (filter === "unanswered") {
    filtered = filtered.filter((p) => p.kind === "question" && (p.commentCount || 0) === 0);
  } else if (filter === "following" || filter === "near") {
    filtered = posts;
  }
  if (sort === "oldest") {
    filtered = [...filtered].sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      const at = a.createdAt?.toMillis?.() || Number(a.createdAt) || 0;
      const bt = b.createdAt?.toMillis?.() || Number(b.createdAt) || 0;
      return at - bt;
    });
  } else if (sort === "top") {
    filtered = [...filtered].sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return Object.keys(b.likes || {}).length - Object.keys(a.likes || {}).length;
    });
  } else if (sort === "activity") {
    filtered = [...filtered].sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      const at = a.lastActivityAt?.toMillis?.() || a.createdAt?.toMillis?.() || Number(a.createdAt) || 0;
      const bt = b.lastActivityAt?.toMillis?.() || b.createdAt?.toMillis?.() || Number(b.createdAt) || 0;
      return bt - at;
    });
  } else {
    filtered = [...filtered].sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      const at = a.createdAt?.toMillis?.() || Number(a.createdAt) || 0;
      const bt = b.createdAt?.toMillis?.() || Number(b.createdAt) || 0;
      return bt - at;
    });
  }

  const postCount = posts.length;
  const popularCount = posts.filter((p) => Object.keys(p.likes || {}).length > 0).length;
  const mineCount = posts.filter((p) => p.authorId === uid).length;
  const bookmarkedCount = posts.filter((p) => p.bookmarks?.[uid]).length;
  const unansweredCount = posts.filter((p) => p.kind === "question" && (p.commentCount || 0) === 0).length;

  const kindLabel =
    kind === "poll"
      ? t("askAPoll")
      : kind === "question"
        ? t("askAQuestion")
        : kind === "win"
          ? t("askAWin")
          : t("newPost");

  return (
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
            { key: "post", label: `✍️ ${t("tabPost")}` },
            { key: "poll", label: `📊 ${t("tabPoll")}` },
            { key: "question", label: `❓ ${t("tabQuestion")}` },
            { key: "win", label: `🏆 ${t("tabWin")}` },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={kind === tab.key ? styles.kindTabActive : styles.kindTab}
              onClick={() => setKind(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <MentionInput
          className={styles.composerInput}
          rows={3}
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
        <div className={styles.composerRow}>
          <div className={styles.composerLeft}>
            <button
              type="button"
              className={styles.uploadBtn}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
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
            <p className={styles.composerHint}>{t("beKind")}</p>
          </div>
          <button
            className={styles.postButton}
            type="submit"
            disabled={
              busy ||
              uploading ||
              (kind === "poll"
                ? pollOptions.filter((opt) => opt.trim().length > 0).length < 2
                : !text.trim() && !imageUrl)
            }
          >
            {busy ? t("posting") : kindLabel}
          </button>
        </div>
      </form>
      )}

      <div className={styles.feedBar}>
        <input
          className={styles.search}
          type="search"
          placeholder={t("searchPosts")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className={styles.filterTabs}>
          <button
            className={filter === "all" ? styles.filterTabActive : styles.filterTab}
            onClick={() => selectFilter("all")}
          >
            {t("all", { count: postCount })}
          </button>
          {!groupId && !spaceId && (
            <button
              className={filter === "following" ? styles.filterTabActive : styles.filterTab}
              onClick={() => selectFilter("following")}
            >
              {t("following", { count: followingCount })}
            </button>
          )}
          {!groupId && !spaceId && (
            <button
              className={filter === "near" ? styles.filterTabActive : styles.filterTab}
              onClick={() => selectFilter("near")}
            >
              {t("nearYou", { count: nearCount })}
            </button>
          )}
          <button
            className={filter === "popular" ? styles.filterTabActive : styles.filterTab}
            onClick={() => setFilter("popular")}
          >
            {t("popular", { count: popularCount })}
          </button>
          <button
            className={filter === "mine" ? styles.filterTabActive : styles.filterTab}
            onClick={() => setFilter("mine")}
          >
            {t("mine", { count: mineCount })}
          </button>
          <button
            className={filter === "bookmarked" ? styles.filterTabActive : styles.filterTab}
            onClick={() => setFilter("bookmarked")}
          >
            {t("saved", { count: bookmarkedCount })}
          </button>
          <button
            className={filter === "hosts" ? styles.filterTabActive : styles.filterTab}
            onClick={() => setFilter("hosts")}
          >
            {t("hosts")}
          </button>
          <button
            className={filter === "unanswered" ? styles.filterTabActive : styles.filterTab}
            onClick={() => setFilter("unanswered")}
          >
            {t("unanswered", { count: unansweredCount })}
          </button>
        </div>
        <div className={styles.sortTabs}>
          <select
            className={styles.sortSelect}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="newest">{t("sortNewest")}</option>
            <option value="oldest">{t("sortOldest")}</option>
            <option value="top">{t("sortTop")}</option>
            <option value="activity">{t("sortLatestActivity")}</option>
          </select>
        </div>
      </div>

      {loadError ? (
        <p className={styles.empty}>{t("loadError")}</p>
      ) : filtered.length === 0 ? (
        <p className={styles.empty}>
          {queryText
            ? t("noPostsSearch")
            : filter === "following"
            ? t("noPostsFollowing")
            : filter === "near"
            ? t("noPostsNear")
            : spaceId
            ? t("noPostsSpace")
            : groupId
            ? t("noPostsGroup")
            : t("noPosts")}
        </p>
      ) : (
        <div className={styles.postList}>
          {filtered.map((post) => (
            <article key={post.id} className={styles.post} style={postCardStyle(post.kind)}>
              <div className={styles.postHeader}>
                <div className={styles.avatar}>
                  {(post.authorName || "?").slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <p className={styles.postAuthor}>
                    {post.authorName}
                    {post.kind === "announcement" && <span className={styles.kindBadge}>📜 {t("announcement")}</span>}
                    {post.kind === "poll" && <span className={styles.kindBadge}>📊 {t("tabPoll")}</span>}
                    {post.kind === "question" && <span className={styles.kindBadge}>❓ {t("tabQuestion")}</span>}
                    {post.kind === "win" && <span className={styles.kindBadge}>🏆 {t("tabWin")}</span>}
                    {post.pinned && <span className={styles.pinnedBadge}>📌 {t("pinned")}</span>}
                  </p>
                  <p className={styles.postTime}>{timeAgo(post.createdAt)}</p>
                </div>
                {canModerate && (
                  <button
                    className={styles.pinBtn}
                    onClick={() => handlePin(post.id)}
                    title={post.pinned ? t("unpinPost") : t("pinPost")}
                  >
                    {post.pinned ? t("unpin") : t("pin")}
                  </button>
                )}
                {(post.authorId === uid || (canModerate && post.authorId !== "system")) && (
                  <button
                    className={styles.deletePost}
                    onClick={() => handleDelete(post.id)}
                    title={t("deletePost")}
                  >
                    {t("delete")}
                  </button>
                )}
                {post.authorId !== uid && post.authorId !== "system" && (
                  <ReportButton type="post" targetId={post.id} />
                )}
              </div>
              {post.text && <p className={styles.postText}>{renderMentions(post.text)}</p>}
              {post.kind === "poll" && (
                <PollBlock postId={post.id} post={post} uid={uid} disabled={!canWriteChat && !canModerate} />
              )}
              {post.imageUrl && (
                <img src={post.imageUrl} alt="" className={styles.postImage} />
              )}
              {post.kind === "announcement" && post.authorId === "system" ? (
                <p className={styles.readOnlyNote}>{t("readOnlyNote")}</p>
              ) : (
                <>
                  <div className={styles.postActions}>
                    <LikeButton postId={post.id} likes={post.likes} uid={uid} disabled={!canWriteChat && !canModerate} />
                    <BookmarkButton postId={post.id} bookmarks={post.bookmarks} uid={uid} disabled={!canWriteChat && !canModerate} />
                  </div>
                  <EmojiReactionBar postId={post.id} reactions={post.reactions} uid={uid} disabled={!canWriteChat && !canModerate} />
                  <CommentList postId={post.id} uid={uid} canModerate={canModerate} disabled={!canWriteChat && !canModerate} />
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
