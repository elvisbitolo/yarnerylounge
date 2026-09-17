"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { UPGRADE_URL } from "@/lib/upgrade-url";
import styles from "../chat.module.css";
import tStyles from "./thread.module.css";
import { renderRichText } from "@/lib/chat-render";
import { subscribeConversation, subscribeTyping } from "@/lib/chat-realtime";
import { chatTimeLabel, dayDividerLabel, isSameLocalDay } from "@/lib/chat-time";
import { Pin, Paperclip, Image as ImageIcon, Lock, Smile } from "lucide-react";

const POLL_INTERVAL_MS = 4000;

const MAX_FILE_RAW = 10 * 1024 * 1024;
const MAX_IMAGE_RAW = 8 * 1024 * 1024;
const MAX_DATA_URL = 700_000;

const EMOJIS = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎",
  "🤩", "🥳", "😇", "🙂", "😉", "😅", "🤗", "🤔",
  "🙃", "😴", "🤤", "😋", "😜", "🥰", "😭", "😤",
  "😡", "🤯", "😱", "🥶", "🤒", "🤕", "👏", "🙌",
  "👍", "👎", "👊", "✊", "🤝", "💪", "🙏", "💅",
  "👋", "🫶", "❤️", "💜", "💛", "💚", "💙", "🔥",
  "✨", "🎉", "🎂", "🎁", "⭐", "🌈", "🌹", "🍀",
  "🍕", "☕", "🚀", "💯",
];

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Couldn't read that file"));
    reader.readAsDataURL(file);
  });
}

function BubbleContent({ msg, searchQuery, isReply, onTag }) {
  const bubbleTextClass = isReply ? tStyles.replyBubbleText : styles.bubbleText;

  if (!msg.text) return null;

  let content = renderRichText(msg.text, onTag ? { onTag } : undefined);

  if (searchQuery) {
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    content = content.map((node, i) => {
      if (typeof node === "string") {
        const parts = node.split(new RegExp(`(${escaped})`, "gi"));
        return parts.length === 1
          ? node
          : <span key={`hl-${i}`}>{parts.map((part, j) =>
              part.toLowerCase() === searchQuery.toLowerCase() ? (
                <mark key={`hl-${i}-${j}`} className={tStyles.highlight}>{part}</mark>
              ) : (
                part
              )
            )}</span>;
      }
      if (node?.props?.children) {
        const NodeType = node.type;
        return (
          <NodeType key={i} {...node.props}>
            {React.Children.map(node.props.children, (child, j) => {
              if (typeof child === "string") {
                const parts = child.split(new RegExp(`(${escaped})`, "gi"));
                return parts.length === 1
                  ? child
                  : <span key={`hl-${i}-${j}`}>{parts.map((part, k) =>
                      part.toLowerCase() === searchQuery.toLowerCase() ? (
                        <mark key={`hl-${i}-${j}-${k}`} className={tStyles.highlight}>{part}</mark>
                      ) : (
                        part
                      )
                    )}</span>;
              }
              return child;
            })}
          </NodeType>
        );
      }
      return node;
    });
  }

  return content ? <p className={bubbleTextClass}>{content}</p> : null;
}

export default function Thread({ conversationId, uid, selfName = "You", initialMessages, initialHasMore = false, canWriteChat = false }) {
  const [messages, setMessages] = useState(initialMessages);
  const [hasOlder, setHasOlder] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [attachment, setAttachment] = useState(null);
  const [attachError, setAttachError] = useState("");
  const [sendError, setSendError] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [expandedThreads, setExpandedThreads] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const bottomRef = useRef(null);
  const emojiRef = useRef(null);
  const replyInputRef = useRef(null);
  const typingRef = useRef(null);

  const [typingUsers, setTypingUsers] = useState([]);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [reactionsOpen, setReactionsOpen] = useState(null);
  const [pendingId, setPendingId] = useState(null);
  const pendingIdRef = useRef(null);
  const [mentionSuggestions, setMentionSuggestions] = useState([]);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionIndex, setMentionIndex] = useState(-1);
  const mentionFetchRef = useRef(null);
  const mentionDropdownRef = useRef(null);
  const lastMsgIdRef = useRef(initialMessages[initialMessages.length - 1]?.id);

  // Merges the freshest page into the loaded history, keeping any older
// messages the user has paginated in. Sorted ascending by timestamp.
  const mergeMessages = useCallback((existing, incoming) => {
    const map = new Map();
    for (const m of existing) if (m.id && m.id !== pendingIdRef.current) map.set(m.id, m);
    for (const m of incoming) map.set(m.id, m);
    return [...map.values()].sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
  }, []);

  const refreshTyping = useCallback(() => {
    fetch(`/api/conversations/${conversationId}/typing`)
      .then((r) => (r.ok ? r.json() : { typing: [] }))
      .then((d) => {
        if (Array.isArray(d.typing)) setTypingUsers(d.typing);
      })
      .catch(() => {});
  }, [conversationId]);

  // Single refresh path: messages + read + typing + pinned. Called by the
  // realtime channel (instant) and by the polling fallback (reliability).
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => mergeMessages(prev, Array.isArray(data.messages) ? data.messages : []));
      }
      fetch(`/api/conversations/${conversationId}/read`, { method: "POST" }).catch(() => {});
      refreshTyping();
      fetch(`/api/conversations/${conversationId}/pinned`)
        .then((r) => (r.ok ? r.json() : { messages: [] }))
        .then((d) => {
          if (Array.isArray(d.messages)) setPinnedMessages(d.messages);
        })
        .catch(() => {});
    } catch {
      // transient network error — the next poll/event retries
    }
  }, [conversationId, mergeMessages, refreshTyping]);

  // Loads one more page of history BEFORE the oldest loaded message. Prepend
  // via the timestamp-ordered merge so existing/newer messages stay put.
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasOlder) return;
    const first = messages[0];
    const before = Number(first?.createdAt) || 0;
    if (!before) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages?before=${before}`);
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => mergeMessages(prev, Array.isArray(data.messages) ? data.messages : []));
        setHasOlder(!!data.hasMore);
      }
    } catch {
      // transient — the button stays available for another attempt
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, messages, hasOlder, loadingOlder, mergeMessages]);

  // Polling fallback (used when the realtime socket is briefly unavailable).
  useEffect(() => {
    let disposed = false;
    const timer = setInterval(() => {
      if (!disposed && document.visibilityState !== "hidden") refresh();
    }, POLL_INTERVAL_MS);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [refresh]);

  // Realtime delivery: the instant a message row lands in this conversation,
  // refresh. The channel subscribes as this participant via RLS; revocation or
  // token expiry just falls back to the poll above.
  useEffect(() => {
    let disposed = false;
    let stop = () => {};

    subscribeConversation(conversationId, {
      onEvent: () => {
        if (!disposed && document.visibilityState !== "hidden") refresh();
      },
    })
      .then((s) => {
        if (disposed) s();
        else stop = s;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      stop();
    };
  }, [conversationId, refresh]);

  // Realtime typing: the moment anyone's typing row lands, refresh the typing
  // indicator instead of waiting for the 4s poll. Falls back to the poll.
  useEffect(() => {
    let disposed = false;
    let stop = () => {};

    subscribeTyping(conversationId, {
      onEvent: () => {
        if (!disposed && document.visibilityState !== "hidden") refreshTyping();
      },
    })
      .then((s) => {
        if (disposed) s();
        else stop = s;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      stop();
    };
  }, [conversationId, refreshTyping]);

  // Auto-scroll only when a NEW message lands at the end of the history
  // (loading older pages changes the front, and must not yank the view).
  useEffect(() => {
    const lastId = messages[messages.length - 1]?.id;
    if (lastId && lastId !== lastMsgIdRef.current) {
      lastMsgIdRef.current = lastId;
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    function onPointerDown(e) {
      if (showEmoji && emojiRef.current && !emojiRef.current.contains(e.target)) {
        setShowEmoji(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [showEmoji]);

  useEffect(() => {
    if (replyingTo && replyInputRef.current) {
      replyInputRef.current.focus();
    }
  }, [replyingTo]);

  // Uploads a large attachment to Blob storage (server route falls back to a
  // data URL when no BLOB token is configured). Returns the storage URL.
  async function uploadToBlob(file) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload?kind=chat", { method: "POST", body: fd });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Couldn't upload that file");
    }
    const data = await res.json();
    return data.url || data.dataUrl || "";
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAttachError("");
    try {
      let dataUrl;
      if (file.type.startsWith("image/")) {
        if (file.size > MAX_IMAGE_RAW) {
          setAttachError("Image must be 8 MB or smaller.");
          return;
        }
        dataUrl = await resizeImage(file);
      } else {
        if (file.size > MAX_FILE_RAW) {
          setAttachError("Documents must be 10 MB or smaller.");
          return;
        }
        if (file.size > MAX_DATA_URL && file.size <= MAX_FILE_RAW) {
          dataUrl = await uploadToBlob(file);
        } else {
          dataUrl = await fileToDataUrl(file);
        }
      }
      if (!dataUrl && dataUrl !== "") {
        setAttachError("Couldn't attach that file.");
        return;
      }
      if (dataUrl.length > MAX_DATA_URL) {
        setAttachError("That file is too large to attach yet — try a smaller photo or file.");
        return;
      }
      setAttachment({
        name: file.name.slice(0, 120),
        mime: file.type || "application/octet-stream",
        kind: file.type.startsWith("image/") ? "image" : "file",
        size: file.size,
        dataUrl,
      });
    } catch (err) {
      setAttachError(err.message || "Couldn't attach that file.");
    }
  }

  function insertEmoji(emoji) {
    const el = inputRef.current;
    if (!el) {
      setText((prev) => prev + emoji);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function handleSend(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if ((!trimmed && !attachment) || busy) return;
    setBusy(true);
    setSendError("");

    // Optimistic append: the sender sees their message instantly while it
    // persists; the realtime event + refresh() reconcile it with the saved
    // copy (and the other member's screen updates the same moment it lands).
    let tempId = null;
    if (trimmed || attachment) {
      tempId = `sending-${Date.now()}`;
      const tempMsg = {
        id: tempId,
        conversationId,
        senderId: uid,
        senderName: selfName || "You",
        text: trimmed,
        createdAt: Date.now(),
        readBy: {},
        replies: [],
        replyCount: 0,
        parentId: null,
        hasAttachment: !!attachment,
        sending: true,
      };
      if (attachment) tempMsg.attachment = attachment;
      setMessages((prev) => [...prev, tempMsg]);
      setPendingId(tempId);
      pendingIdRef.current = tempId;
      setText("");
      setAttachment(null);
      setShowEmoji(false);
    }

    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          attachment,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send");
      }
      setPendingId(null);
      pendingIdRef.current = null;
      refresh();
    } catch (err) {
      setPendingId(null);
      pendingIdRef.current = null;
      if (tempId) setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setSendError(err.message || "Failed to send");
    } finally {
      setBusy(false);
    }
  }

  async function handleReplySend(parentId) {
    const trimmed = replyText.trim();
    if (!trimmed || replyBusy) return;
    setReplyBusy(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, parentId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send reply");
      }
      setReplyText("");
      setReplyingTo(null);
      setExpandedThreads((prev) => ({ ...prev, [parentId]: true }));
      refresh();
    } catch {
      // transient — next poll picks it up
    } finally {
      setReplyBusy(false);
    }
  }

  function handleKeyDown(e) {
    if (mentionQuery && mentionSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % mentionSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        if (mentionIndex >= 0 && mentionIndex < mentionSuggestions.length) {
          e.preventDefault();
          insertMention(mentionSuggestions[mentionIndex]);
          return;
        }
        if (e.key === "Tab") return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeMentions();
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  }

  function handleReplyKeyDown(e, parentId) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleReplySend(parentId);
    }
  }

  function toggleThread(msgId) {
    setExpandedThreads((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  }

  function handleTyping() {
    if (typingRef.current) clearTimeout(typingRef.current);
    typingRef.current = setTimeout(() => {
      fetch(`/api/conversations/${conversationId}/typing`, { method: "POST" }).catch(() => {});
    }, 400);
  }

  function closeMentions() {
    setMentionQuery(null);
    setMentionSuggestions([]);
    setMentionIndex(-1);
  }

  function detectMention(value, caret) {
    if (caret == null) return null;
    const before = value.slice(0, caret);
    const match = before.match(/@([a-zA-Z0-9_.]{1,30})$/);
    return match ? { start: match.index + 1, query: match[1] } : null;
  }

  function fetchMentions(q) {
    if (mentionFetchRef.current) clearTimeout(mentionFetchRef.current);
    mentionFetchRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/members/mention?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setMentionSuggestions(Array.isArray(data.members) ? data.members : []);
          setMentionIndex(-1);
        } else {
          setMentionSuggestions([]);
        }
      } catch {
        setMentionSuggestions([]);
      }
    }, 200);
  }

  function handleComposerChange(e) {
    const value = e.target.value;
    setText(value);
    handleTyping();
    const mention = detectMention(value, e.target.selectionStart ?? value.length);
    if (mention) {
      setMentionQuery(mention);
      fetchMentions(mention.query);
    } else {
      closeMentions();
    }
  }

  function insertMention(member) {
    if (!mentionQuery) return;
    const before = text.slice(0, mentionQuery.start - 1);
    const after = text.slice(mentionQuery.start + mentionQuery.query.length);
    const insert = member.username || member.name || member.uid;
    setText(`${before}@${insert} ${after}`);
    closeMentions();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      const pos = before.length + insert.length + 2;
      inputRef.current?.setSelectionRange(pos, pos);
    });
  }

  useEffect(() => {
    function onPointerDown(e) {
      if (mentionDropdownRef.current && !mentionDropdownRef.current.contains(e.target)) {
        closeMentions();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      if (mentionFetchRef.current) clearTimeout(mentionFetchRef.current);
    };
  }, []);

  async function toggleReaction(msg, emoji, e) {
    e?.stopPropagation();
    if (!canWriteChat) return;
    setReactionsOpen(null);
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/messages/${msg.id}/reactions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, reactions: data.reactions } : m))
        );
      }
    } catch {
      // transient — next poll reconciles
    }
  }

  async function togglePin(msg) {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/pinned`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: msg.id }),
      });
      if (res.ok) {
        const { pinned } = await res.json();
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, pinned } : m))
        );
        const pr = await fetch(`/api/conversations/${conversationId}/pinned`).catch(() => null);
        if (pr?.ok) {
          const d = await pr.json();
          setPinnedMessages(Array.isArray(d.messages) ? d.messages : []);
        }
      }
    } catch {
      // transient
    }
  }

  function reactionSummary(msg) {
    if (!msg.reactions) return [];
    return Object.entries(msg.reactions).map(([emoji, users]) => {
      const reacted = !!users[uid];
      return { emoji, count: Object.keys(users).length, reacted };
    });
  }

  const filteredMessages = searchQuery.trim()
    ? messages.filter((m) => {
        const q = searchQuery.toLowerCase();
        const matchesSelf = (m.text || "").toLowerCase().includes(q);
        const matchesReply = (m.replies || []).some((r) =>
          (r.text || "").toLowerCase().includes(q)
        );
        return matchesSelf || matchesReply;
      })
    : messages;

  const matchCount = searchQuery.trim()
    ? filteredMessages.reduce((acc, m) => {
        const q = searchQuery.toLowerCase();
        let count = 0;
        if ((m.text || "").toLowerCase().includes(q)) count++;
        count += (m.replies || []).filter((r) =>
          (r.text || "").toLowerCase().includes(q)
        ).length;
        return acc + count;
      }, 0)
    : 0;

  return (
    <div className={styles.threadBody}>
      <div className={tStyles.searchBar}>
        <input
          className={tStyles.searchInput}
          type="text"
          placeholder="Search messages…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery.trim() && (
          <>
            <button
              type="button"
              className={tStyles.searchClear}
              onClick={() => setSearchQuery("")}
            >
              Clear
            </button>
            <p className={tStyles.searchCount}>
              {matchCount} {matchCount === 1 ? "message matches" : "messages match"}
            </p>
          </>
        )}
      </div>

      {pinnedMessages.length > 0 && (
        <div className={tStyles.pinnedBar}>
          <span className={tStyles.pinnedLabel}><Pin size={12} /> Pinned</span>
          {pinnedMessages.slice(0, 3).map((p) => (
            <span key={p.id} className={tStyles.pinnedChip}>
              {p?.senderName || "Member"}: <span className={tStyles.pinnedText}>{p?.text || (p?.hasAttachment ? "Photo" : "…")}</span>
            </span>
          ))}
        </div>
      )}

      <div className={styles.messages}>
        {hasOlder && (
          <button
            type="button"
            className={tStyles.loadOlder}
            onClick={loadOlder}
            disabled={loadingOlder}
          >
            {loadingOlder ? "Loading earlier messages…" : "Load earlier messages"}
          </button>
        )}
        {filteredMessages.length === 0 && (
          <p className={styles.empty}>
            {searchQuery.trim() ? "No messages match your search" : "No messages yet — say hello!"}
          </p>
        )}
        {filteredMessages.map((msg, index) => {
          const isMine = msg.senderId === uid;
          const millis =
            msg.createdAt?.toMillis?.() ||
            msg.createdAt?.seconds * 1000 ||
            Number(msg.createdAt) ||
            0;
          const prevMillis =
            index > 0
              ? filteredMessages[index - 1].createdAt?.toMillis?.() ||
                filteredMessages[index - 1].createdAt?.seconds * 1000 ||
                Number(filteredMessages[index - 1].createdAt) ||
                0
              : 0;
          const showDayDivider = index === 0 || !isSameLocalDay(prevMillis, millis);
          const replies = msg.replies || [];
          const isExpanded = expandedThreads[msg.id] || false;
          return (
            <div key={msg.id} className={tStyles.threadMessage}>
              {showDayDivider && (
                <div className={tStyles.dayDivider}>{dayDividerLabel(millis)}</div>
              )}
              <div
                className={isMine ? `${styles.bubble} ${styles.mine}` : styles.bubble}
              >
                {!isMine && <p className={styles.bubbleName}>{msg?.senderName || "Member"}</p>}
                <BubbleContent msg={msg} searchQuery={searchQuery.trim()} onTag={(tag) => setSearchQuery(tag)} />
                {msg.attachment?.kind === "image" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className={styles.bubbleImage}
                    src={msg.attachment.dataUrl}
                    alt={msg.attachment.name || "Shared image"}
                  />
                )}
                {msg.attachment && msg.attachment.kind !== "image" && (
                  <a
                    className={styles.fileChip}
                    href={msg.attachment.dataUrl}
                    download={msg.attachment.name}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className={styles.fileIcon}><Paperclip size={13} /></span>
                    <span className={styles.fileMeta}>
                      <span className={styles.fileName}>{msg.attachment.name}</span>
                      <span className={styles.fileSize}>
                        {formatBytes(msg.attachment.size)}
                      </span>
                    </span>
                    <span className={styles.fileDownload}>Download</span>
                  </a>
                )}
                {msg.sending ? (
                  <p className={tStyles.sendingNote}>Sending…</p>
                ) : (
                  <p className={styles.bubbleTime}>{chatTimeLabel(millis)}</p>
                )}
                {canWriteChat && (
                <div className={tStyles.replyActions}>
                  {replies.length > 0 && (
                    <button
                      type="button"
                      className={tStyles.replyCountBadge}
                      onClick={() => toggleThread(msg.id)}
                    >
                      {isExpanded ? "▾" : "▸"} {replies.length} {replies.length === 1 ? "reply" : "replies"}
                    </button>
                  )}
                  <button
                    type="button"
                    className={tStyles.replyBtn}
                    onClick={() => {
                      setReplyingTo(replyingTo === msg.id ? null : msg.id);
                      setReplyText("");
                    }}
                  >
                    ↩ Reply
                  </button>
                  <button
                    type="button"
                    className={msg.pinned ? tStyles.pinBtnActive : tStyles.replyBtn}
                    onClick={() => togglePin(msg)}
                  >
                    {msg.pinned ? <><Pin size={10} /> Pinned</> : <><Pin size={10} /> Pin</>}
                  </button>
                  <button
                    type="button"
                    className={tStyles.replyBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      setReactionsOpen(reactionsOpen === msg.id ? null : msg.id);
                    }}
                  >
<Smile size={14} />
                  </button>
                </div>
                )}
                {reactionSummary(msg).length > 0 && (
                  <div className={tStyles.reactionRow}>
                    {reactionSummary(msg).map(({ emoji, count, reacted }) => (
                      <button
                        key={emoji}
                        type="button"
                        className={reacted ? tStyles.reactionActive : tStyles.reactionChip}
                        onClick={(e) => toggleReaction(msg, emoji, e)}
                      >
                        {emoji} {count}
                      </button>
                    ))}
                  </div>
                )}
                {reactionsOpen === msg.id && (
                  <div className={tStyles.reactionPicker}>
                    {["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉", "👏", "💯", "🧶", "⭐"].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className={tStyles.reactionPick}
                        onClick={(e) => toggleReaction(msg, emoji, e)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
                {isMine &&
                  msg.readBy &&
                  Object.keys(msg.readBy).some((readerId) => readerId !== uid) ? (
                  <p className={tStyles.readReceipt}>✓✓ Read</p>
                ) : null}
              </div>

              {isExpanded && replies.length > 0 && (
                <div>
                  {replies.map((reply) => {
                    const isReplyMine = reply.senderId === uid;
                    const replyMillis =
                      reply.createdAt?.toMillis?.() ||
                      reply.createdAt?.seconds * 1000 ||
                      Number(reply.createdAt) ||
                      0;
                    return (
                      <div
                        key={reply.id}
                        className={tStyles.replyConnector}
                      >
                        <div
                          className={`${tStyles.replyBubble} ${isReplyMine ? tStyles.replyMine : ""}`}
                        >
                          {!isReplyMine && <p className={styles.bubbleName}>{reply?.senderName || "Member"}</p>}
                          <BubbleContent msg={reply} searchQuery={searchQuery.trim()} isReply onTag={(tag) => setSearchQuery(tag)} />
                          <p className={styles.bubbleTime}>{chatTimeLabel(replyMillis)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {replyingTo === msg.id && (
                <div className={tStyles.replyConnector}>
                  <div className={tStyles.replyInputWrap}>
                    <textarea
                      ref={replyInputRef}
                      className={tStyles.replyInput}
                      rows={1}
                      placeholder="Write a reply…"
                      value={replyText}
                      onChange={(e) => {
                        setReplyText(e.target.value);
                        handleTyping();
                      }}
                      onKeyDown={(e) => handleReplyKeyDown(e, msg.id)}
                      maxLength={2000}
                    />
                    <button
                      type="button"
                      className={tStyles.replySend}
                      disabled={!replyText.trim() || replyBusy}
                      onClick={() => handleReplySend(msg.id)}
                    >
                      {replyBusy ? "…" : "Send"}
                    </button>
                    <button
                      type="button"
                      className={tStyles.replyCancel}
                      onClick={() => { setReplyingTo(null); setReplyText(""); }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {typingUsers.length > 0 && (
          <p className={tStyles.typingIndicator}>
            {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing…
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {attachError && <p className={styles.attachError}>{attachError}</p>}
      {sendError && <p className={styles.attachError}>{sendError}</p>}

      {attachment && (
        <div className={styles.attachPreview}>
          <span className={styles.attachPreviewIcon}>
            {attachment.kind === "image" ? <ImageIcon size={13} /> : <Paperclip size={13} />}
          </span>
          <span className={styles.attachPreviewName}>{attachment.name}</span>
          <button
            type="button"
            className={styles.attachRemove}
            onClick={() => setAttachment(null)}
            aria-label="Remove attachment"
          >
            ✕
          </button>
        </div>
      )}

      <div className={styles.emojiWrap} ref={emojiRef}>
        {showEmoji && (
          <div className={styles.emojiPicker}>
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={styles.emojiBtn}
                onClick={() => insertEmoji(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      {canWriteChat ? (
      <div className={styles.mentionWrap}>
        {mentionQuery && mentionSuggestions.length > 0 && (
          <div ref={mentionDropdownRef} className={styles.mentionDropdown} role="listbox" aria-label="Mention a member">
            {mentionSuggestions.map((member, index) => (
              <button
                key={member.uid}
                type="button"
                role="option"
                aria-selected={index === mentionIndex}
                className={`${styles.mentionItem} ${index === mentionIndex ? styles.mentionItemActive : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(member);
                }}
                onMouseEnter={() => setMentionIndex(index)}
              >
                <span className={styles.mentionAvatar}>
                  {(member.name || "?").slice(0, 1).toUpperCase()}
                </span>
                <span className={styles.mentionInfo}>
                  <span className={styles.mentionName}>{member.name || member.username}</span>
                  {member.username && (
                    <span className={styles.mentionUsername}>@{member.username}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      <form className={styles.composer} onSubmit={handleSend}>
        <button
          type="button"
          className={`${styles.iconBtn} ${showEmoji ? styles.iconBtnActive : ""}`}
          onClick={() => setShowEmoji((v) => !v)}
          aria-label="Add emoji"
        >
<Smile size={18} />
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => fileRef.current?.click()}
          aria-label="Attach a file"
        >
          <Paperclip size={18} />
        </button>
        <textarea
          ref={inputRef}
          className={styles.input}
          rows={1}
          placeholder="Type a message…"
          value={text}
          onChange={handleComposerChange}
          onKeyDown={handleKeyDown}
          maxLength={2000}
        />
        <button
          className={styles.send}
          type="submit"
          disabled={(!text.trim() && !attachment) || busy}
        >
          {busy ? "Sending…" : "Send"}
        </button>
        <input
          ref={fileRef}
          type="file"
          style={{ display: "none" }}
          onChange={handleFile}
        />
      </form>
      </div>
      ) : (
        <div className={styles.upgradePrompt}>
          <span><Lock size={16} /></span>
          <span>Upgrade to chat with the community!</span>
          <a
            className={styles.upgradePromptLink}
            href={UPGRADE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Upgrade
          </a>
        </div>
      )}
    </div>
  );
}
