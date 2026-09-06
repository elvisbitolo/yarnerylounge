"use client";

import { useState, useEffect, useRef } from "react";
import { UPGRADE_URL } from "@/lib/upgrade-url";
import styles from "../chat.module.css";
import tStyles from "./thread.module.css";
import { renderRichText } from "@/lib/chat-render";

const POLL_INTERVAL_MS = 4000;

const MAX_FILE_RAW = 450 * 1024;
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

function timeLabel(millis) {
  if (!millis) return "";
  return new Date(millis).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

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

function highlightMatch(text, query) {
  if (!query || !text) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className={tStyles.highlight}>{part}</mark>
    ) : (
      part
    )
  );
}

function BubbleContent({ msg, searchQuery, isReply }) {
  const bubbleTextClass = isReply ? tStyles.replyBubbleText : styles.bubbleText;

  if (!msg.text) return null;

  let content = renderRichText(msg.text);

  if (searchQuery) {
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    content = content.map((node, i) => {
      if (typeof node !== "string") return node;
      const parts = node.split(new RegExp(`(${escaped})`, "gi"));
      return parts.length === 1
        ? node
        : <span key={`hl-${i}`}>{parts.map((part, j) =>
            part.toLowerCase() === searchQuery.toLowerCase() ? (
              <mark key={j} className={tStyles.highlight}>{part}</mark>
            ) : (
              part
            )
          )}</span>;
    });
  }

  return content ? <p className={bubbleTextClass}>{content}</p> : null;
}

export default function Thread({ conversationId, uid, initialMessages, canWriteChat = true }) {
  const [messages, setMessages] = useState(initialMessages);
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

  useEffect(() => {
    let active = true;
    let timer;

    async function load() {
      try {
        const res = await fetch(`/api/conversations/${conversationId}/messages`);
        if (active && res.ok) {
          const data = await res.json();
          setMessages(Array.isArray(data.messages) ? data.messages : []);
        }
        fetch(`/api/conversations/${conversationId}/read`, { method: "POST" }).catch(() => {});
        fetch(`/api/conversations/${conversationId}/typing`)
          .then((r) => (r.ok ? r.json() : { typing: [] }))
          .then((d) => active && setTypingUsers(Array.isArray(d.typing) ? d.typing : []))
          .catch(() => {});
        fetch(`/api/conversations/${conversationId}/pinned`)
          .then((r) => (r.ok ? r.json() : { messages: [] }))
          .then((d) => active && setPinnedMessages(Array.isArray(d.messages) ? d.messages : []))
          .catch(() => {});
      } catch {
        // transient network error — the next poll will retry
      }
    }

    load();
    timer = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
      if (typingRef.current) {
        clearTimeout(typingRef.current);
        typingRef.current = null;
      }
    };
  }, [conversationId]);

  useEffect(() => {
    return () => {
      if (typingRef.current) {
        clearTimeout(typingRef.current);
        typingRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

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
          setAttachError("Documents must be 450 KB or smaller right now (storage is being set up).");
          return;
        }
        dataUrl = await fileToDataUrl(file);
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
      setText("");
      setAttachment(null);
      setShowEmoji(false);
    } catch (err) {
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
    } catch {
      // transient — next poll picks it up
    } finally {
      setReplyBusy(false);
    }
  }

  function handleKeyDown(e) {
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
          <span className={tStyles.pinnedLabel}>📌 Pinned</span>
          {pinnedMessages.slice(0, 3).map((p) => (
            <span key={p.id} className={tStyles.pinnedChip}>
              {p.senderName}: …
            </span>
          ))}
        </div>
      )}

      <div className={styles.messages}>
        {filteredMessages.length === 0 && (
          <p className={styles.empty}>
            {searchQuery.trim() ? "No messages match your search" : "No messages yet — say hello!"}
          </p>
        )}
        {filteredMessages.map((msg) => {
          const isMine = msg.senderId === uid;
          const millis =
            msg.createdAt?.toMillis?.() ||
            msg.createdAt?.seconds * 1000 ||
            Number(msg.createdAt) ||
            0;
          const replies = msg.replies || [];
          const isExpanded = expandedThreads[msg.id] || false;
          return (
            <div key={msg.id} className={tStyles.threadMessage}>
              <div
                className={isMine ? `${styles.bubble} ${styles.mine}` : styles.bubble}
              >
                {!isMine && <p className={styles.bubbleName}>{msg.senderName}</p>}
                <BubbleContent msg={msg} searchQuery={searchQuery.trim()} />
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
                    <span className={styles.fileIcon}>📎</span>
                    <span className={styles.fileMeta}>
                      <span className={styles.fileName}>{msg.attachment.name}</span>
                      <span className={styles.fileSize}>
                        {formatBytes(msg.attachment.size)}
                      </span>
                    </span>
                    <span className={styles.fileDownload}>Download</span>
                  </a>
                )}
                <p className={styles.bubbleTime}>{timeLabel(millis)}</p>
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
                    {msg.pinned ? "📌 Pinned" : "📌 Pin"}
                  </button>
                  <button
                    type="button"
                    className={tStyles.replyBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      setReactionsOpen(reactionsOpen === msg.id ? null : msg.id);
                    }}
                  >
                    🙂
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
                          {!isReplyMine && <p className={styles.bubbleName}>{reply.senderName}</p>}
                          <BubbleContent msg={reply} searchQuery={searchQuery.trim()} isReply />
                          <p className={styles.bubbleTime}>{timeLabel(replyMillis)}</p>
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
            {attachment.kind === "image" ? "🖼️" : "📎"}
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
      <form className={styles.composer} onSubmit={handleSend}>
        <button
          type="button"
          className={`${styles.iconBtn} ${showEmoji ? styles.iconBtnActive : ""}`}
          onClick={() => setShowEmoji((v) => !v)}
          aria-label="Add emoji"
        >
          😊
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => fileRef.current?.click()}
          aria-label="Attach a file"
        >
          📎
        </button>
        <textarea
          ref={inputRef}
          className={styles.input}
          rows={1}
          placeholder="Type a message…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            handleTyping();
          }}
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
      ) : (
        <div className={styles.upgradePrompt}>
          <span>🔒</span>
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
