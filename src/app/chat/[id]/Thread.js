"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { UPGRADE_URL } from "@/lib/upgrade-url";
import styles from "../chat.module.css";
import tStyles from "./thread.module.css";
import { renderRichText } from "@/lib/chat-render";
import { subscribeConversation, openTypingChannel } from "@/lib/chat-realtime";
import { chatTimeLabel, dayDividerLabel, isSameLocalDay } from "@/lib/chat-time";
import {
  publishTyping,
  clearTyping,
  typingLabel,
  typingNamesFrom,
  readTypingHidden,
  TYPING_THROTTLE_MS,
} from "@/lib/chat-typing-core";
import { Pin, Paperclip, Image as ImageIcon, Lock, Smile, Check, CheckCheck, ChevronDown, Mic, Play, Pause, Video } from "lucide-react";

const POLL_INTERVAL_MS = 4000;

// Typing is ephemeral: a keystroke is broadcast at most once per throttle
// window, and a recipient drops a sender who has gone quiet for the TTL.
const TYPING_PRUNE_MS = 1000;

const GROUP_WINDOW_MS = 5 * 60 * 1000;

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

function formatVoiceDuration(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function pickVoiceMime() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || "";
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Couldn't read that voice note"));
    reader.readAsDataURL(blob);
  });
}

// Downsample the recorded waveform into `buckets` 0–1 amplitudes so recipients
// can render it without downloading the audio first.
async function computePeaks(blob, buckets = 40) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return [];
    const ctx = new AudioCtx();
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    const data = buffer.getChannelData(0);
    const block = Math.max(1, Math.floor(data.length / buckets));
    const peaks = [];
    for (let i = 0; i < buckets; i++) {
      let sum = 0;
      const start = i * block;
      for (let j = 0; j < block; j++) sum += Math.abs(data[start + j] || 0);
      peaks.push(Math.min(1, (sum / block) * 3));
    }
    await ctx.close?.();
    return peaks;
  } catch {
    return [];
  }
}

const DEFAULT_VOICE_BARS = Array.from({ length: 40 }, (_, i) =>
  Math.round((0.25 + 0.6 * Math.abs(Math.sin(i * 0.7))) * 100) / 100
);

function VoiceNote({ url, peaks, durationMs, label }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const bars = Array.isArray(peaks) && peaks.length ? peaks : DEFAULT_VOICE_BARS;

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }

  function seek(e) {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio);
  }

  return (
    <div className={styles.voiceNote}>
      <button
        type="button"
        className={styles.voicePlay}
        onClick={toggle}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <button
        type="button"
        className={styles.voiceWave}
        onClick={seek}
        aria-label={`Seek voice note, ${formatVoiceDuration(durationMs)}`}
      >
        {bars.map((p, i) => (
          <span
            key={i}
            className={`${styles.voiceBar} ${i / bars.length <= progress ? styles.voiceBarPlayed : ""}`}
            style={{ height: `${Math.max(12, Math.round((p || 0.3) * 100))}%` }}
          />
        ))}
      </button>
      <span className={styles.voiceDuration}>{formatVoiceDuration(durationMs)}</span>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={() => {
          const audio = audioRef.current;
          if (audio && audio.duration) setProgress(audio.currentTime / audio.duration);
        }}
        aria-label={label}
        className={styles.voiceAudioHidden}
      />
    </div>
  );
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

export default function Thread({
  conversationId,
  uid,
  selfName = "You",
  initialMessages,
  initialHasMore = false,
  canWriteChat = false,
  searchQuery = "",
  onSearchChange = () => {},
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [hasOlder, setHasOlder] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [attachment, setAttachment] = useState(null);
  const [attachError, setAttachError] = useState("");
  const [sendError, setSendError] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordMs, setRecordMs] = useState(0);
  const [recordError, setRecordError] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [expandedThreads, setExpandedThreads] = useState({});
  const [actionsOpen, setActionsOpen] = useState(null);
  const longPressRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const bottomRef = useRef(null);
  const messagesRef = useRef(null);
  const atBottomRef = useRef(true);
  const emojiRef = useRef(null);
  const replyInputRef = useRef(null);
  const typingSentAtRef = useRef(0);
  const typingChannelRef = useRef(null);
  const typingMapRef = useRef(new Map());
  const recorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const recordStartedAtRef = useRef(0);
  const recordStreamRef = useRef(null);
  const discardRef = useRef(false);

  const [typingUsers, setTypingUsers] = useState([]);
  const [showJump, setShowJump] = useState(false);
  const [lastSeenCount, setLastSeenCount] = useState(initialMessages.length);
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

  // Single refresh path: messages + read + pinned. Called by the realtime
  // channel (instant) and by the polling fallback (reliability). Typing is not
  // here: it rides its own ephemeral broadcast channel.
  // Returns whether the message re-fetch succeeded.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => mergeMessages(prev, Array.isArray(data.messages) ? data.messages : []));
        fetch(`/api/conversations/${conversationId}/read`, { method: "POST" }).catch(() => {});
        fetch(`/api/conversations/${conversationId}/pinned`)
          .then((r) => (r.ok ? r.json() : { messages: [] }))
          .then((d) => {
            if (Array.isArray(d.messages)) setPinnedMessages(d.messages);
          })
          .catch(() => {});
        return true;
      }
      return false;
    } catch {
      // transient network error — the next poll/event retries
      return false;
    }
  }, [conversationId, mergeMessages]);

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

  // Ephemeral typing over Realtime Broadcast. No database row and no poll: the
  // sender throttles keystrokes, the recipient stamps each sender and prunes
  // anyone quiet for TYPING_TTL_MS. A briefly dropped socket just means the
  // indicator goes quiet until the next keystroke.
  useEffect(() => {
    let disposed = false;
    let stop = () => {};
    const typingMap = typingMapRef.current;

    function publish() {
      const names = typingNamesFrom([...typingMap.values()], { uid, now: Date.now() });
      setTypingUsers(names);
      publishTyping(conversationId, names);
    }

    const prune = setInterval(publish, TYPING_PRUNE_MS);

    openTypingChannel(conversationId, {
      onTyping: (entry) => {
        if (disposed || document.visibilityState === "hidden") return;
        if (!entry || typeof entry.userId !== "string" || entry.userId === uid) return;
        if (entry.stopped) {
          typingMap.delete(entry.userId);
          publish();
          return;
        }
        typingMap.set(entry.userId, {
          userId: entry.userId,
          name: typeof entry.name === "string" && entry.name ? entry.name : "Someone",
          at: Date.now(),
        });
        publish();
      },
    })
      .then((channel) => {
        if (disposed) channel.close();
        else {
          typingChannelRef.current = channel;
          stop = () => channel.close();
        }
      })
      .catch(() => {});

    return () => {
      disposed = true;
      clearInterval(prune);
      typingMap.clear();
      typingChannelRef.current = null;
      clearTyping(conversationId);
      stop();
    };
  }, [conversationId, uid]);

  // Auto-scroll only when a NEW message lands at the end of the history
  // (loading older pages changes the front, and must not yank the view).
  useEffect(() => {
    const lastId = messages[messages.length - 1]?.id;
    if (lastId && lastId !== lastMsgIdRef.current) {
      lastMsgIdRef.current = lastId;
      if (atBottomRef.current) {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
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
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      recordStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

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

  function cleanupRecording() {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    const stream = recordStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      recordStreamRef.current = null;
    }
    recorderRef.current = null;
    setRecording(false);
    setRecordMs(0);
  }

  async function startRecording() {
    setRecordError("");
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setRecordError("Voice notes aren't supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickVoiceMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;
      recordChunksRef.current = [];
      discardRef.current = false;
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordChunksRef.current.push(e.data);
      };
      recorder.onstop = () => finalizeRecording(recorder.mimeType || mime || "audio/webm");
      recorder.start();
      // eslint-disable-next-line react-hooks/purity
      recordStartedAtRef.current = Date.now();
      recordStreamRef.current = stream;
      setRecordMs(0);
      setRecording(true);
      recordTimerRef.current = setInterval(() => {
        setRecordMs(Date.now() - recordStartedAtRef.current);
      }, 250);
    } catch {
      setRecordError("Microphone access was blocked.");
    }
  }

  function stopRecording(cancel) {
    const recorder = recorderRef.current;
    if (!recorder) return;
    discardRef.current = !!cancel;
    try {
      recorder.stop();
    } catch {
      cleanupRecording();
    }
  }

  async function finalizeRecording(mime) {
    const chunks = recordChunksRef.current;
    recordChunksRef.current = [];
    const discarded = discardRef.current;
    cleanupRecording();
    if (discarded || chunks.length === 0) return;
    const baseMime = (mime || "audio/webm").split(";")[0].trim() || "audio/webm";
    const blob = new Blob(chunks, { type: baseMime });
    if (!blob.size) return;
    // eslint-disable-next-line react-hooks/purity
    const durationMs = Math.max(0, Date.now() - recordStartedAtRef.current);
    try {
      let dataUrl;
      if (blob.size > MAX_DATA_URL) {
        const ext = baseMime.includes("ogg") ? "ogg" : baseMime.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `voice-note.${ext}`, { type: baseMime });
        dataUrl = await uploadToBlob(file);
      } else {
        dataUrl = await blobToDataUrl(blob);
      }
      if (!dataUrl) throw new Error("Couldn't process that voice note.");
      const peaks = await computePeaks(blob, 40);
      await sendMessage("", {
        name: `Voice note (${formatVoiceDuration(durationMs)})`,
        mime: baseMime,
        kind: "audio",
        size: blob.size,
        durationMs,
        peaks,
        dataUrl,
      });
    } catch (err) {
      setRecordError(err.message || "Couldn't process that voice note.");
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

  // Shared by the composer and voice notes: optimistic append, persist, then
  // reconcile with the saved copy.
  async function sendMessage(payloadText, att) {
    const trimmed = (payloadText || "").trim();
    if ((!trimmed && !att) || busy) return;
    setBusy(true);
    setSendError("");

    // Optimistic append: the sender sees their message instantly while it
    // persists; the realtime event + refresh() reconcile it with the saved
    // copy (and the other member's screen updates the same moment it lands).
    let tempId = null;
    if (trimmed || att) {
      // react-hooks/purity reads this as render-phase, but sendMessage only
      // runs from event handlers. One read also keeps the optimistic id and
      // createdAt on the same millisecond.
      // eslint-disable-next-line react-hooks/purity
      const now = Date.now();
      tempId = `sending-${now}`;
      const tempMsg = {
        id: tempId,
        conversationId,
        senderId: uid,
        senderName: selfName || "You",
        text: trimmed,
        createdAt: now,
        readBy: {},
        replies: [],
        replyCount: 0,
        parentId: null,
        hasAttachment: !!att,
        sending: true,
      };
      if (att) tempMsg.attachment = att;
      setMessages((prev) => [...prev, tempMsg]);
      setPendingId(tempId);
      pendingIdRef.current = tempId;
      setText("");
      setAttachment(null);
      setShowEmoji(false);
      stopTyping();
    }

    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          attachment: att,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send");
      }
      // Reconcile against the saved copy while pendingIdRef is still set so
      // mergeMessages drops the optimistic row and the real one takes over.
      // Discard the temp afterwards in case the re-fetch failed (the next
      // poll will pick the saved message up).
      await refresh();
      if (tempId) setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setPendingId(null);
      pendingIdRef.current = null;
    } catch (err) {
      setPendingId(null);
      pendingIdRef.current = null;
      if (tempId) setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setSendError(err.message || "Failed to send");
    } finally {
      setBusy(false);
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    await sendMessage(text, attachment);
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
    const channel = typingChannelRef.current;
    if (!channel) return;
    if (readTypingHidden()) return;
    // react-hooks/purity reads this as render-phase, but handleTyping only runs
    // from the composer's onChange.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    if (now - typingSentAtRef.current < TYPING_THROTTLE_MS) return;
    typingSentAtRef.current = now;
    channel.send({ userId: uid, name: selfName, at: now });
  }

  // Tell the other side to drop our dots the moment we send, clear the box, or
  // leave the field — don't make them wait out the TTL.
  function stopTyping() {
    typingSentAtRef.current = 0;
    const channel = typingChannelRef.current;
    if (channel) channel.send({ userId: uid, name: selfName, stopped: true });
  }

  // Track whether the reader is pinned to the newest message. When they've
  // scrolled up, new arrivals don't yank the view — instead the jump button
  // surfaces a count of what they haven't seen.
  function handleScroll() {
    const el = messagesRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distance < 120;
    if (nearBottom) {
      atBottomRef.current = true;
      setLastSeenCount(messages.length);
      setShowJump(false);
    } else {
      if (atBottomRef.current) {
        setLastSeenCount(messages.length);
      }
      atBottomRef.current = false;
      setShowJump(true);
    }
  }

  function jumpToLatest() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    atBottomRef.current = true;
    setLastSeenCount(messages.length);
    setShowJump(false);
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
    if (value.trim()) handleTyping();
    else stopTyping();
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

  const newBelow = showJump ? Math.max(0, messages.length - lastSeenCount) : 0;

  return (
    <div className={styles.threadBody}>
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

      <div className={styles.messages} ref={messagesRef} onScroll={handleScroll}>
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
          const prevMsg = index > 0 ? filteredMessages[index - 1] : null;
          const prevMillis = prevMsg
            ? prevMsg.createdAt?.toMillis?.() ||
              prevMsg.createdAt?.seconds * 1000 ||
              Number(prevMsg.createdAt) ||
              0
            : 0;
          const showDayDivider = index === 0 || !isSameLocalDay(prevMillis, millis);
          const grouped =
            !showDayDivider &&
            !!prevMsg &&
            prevMsg.senderId === msg.senderId &&
            !prevMsg.sending &&
            millis - prevMillis < GROUP_WINDOW_MS;
          const replies = msg.replies || [];
          const readByOthers =
            !!msg.readBy && Object.keys(msg.readBy).some((readerId) => readerId !== uid);
          const isExpanded = expandedThreads[msg.id] || false;
          return (
            <div
              key={msg.id}
              className={grouped ? `${tStyles.threadMessage} ${tStyles.grouped}` : tStyles.threadMessage}
            >
              {showDayDivider && (
                <div className={tStyles.dayDivider}>{dayDividerLabel(millis)}</div>
              )}
              <div
                className={`${isMine ? `${styles.bubble} ${styles.mine}` : styles.bubble} ${
                  actionsOpen === msg.id ? tStyles.actionsOpen : ""
                }`}
                onContextMenu={(e) => {
                  if (window.matchMedia?.("(hover: none)").matches) {
                    e.preventDefault();
                    setActionsOpen(msg.id);
                  }
                }}
                onTouchStart={() => {
                  longPressRef.current = setTimeout(() => setActionsOpen(msg.id), 450);
                }}
                onTouchEnd={() => clearTimeout(longPressRef.current)}
                onTouchMove={() => clearTimeout(longPressRef.current)}
                onFocus={() => setActionsOpen(msg.id)}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) setActionsOpen(null);
                }}
              >
                {!isMine && !grouped && <p className={styles.bubbleName}>{msg?.senderName || "Member"}</p>}
                <BubbleContent msg={msg} searchQuery={searchQuery.trim()} onTag={(tag) => onSearchChange(tag)} />
                {msg.attachment?.kind === "image" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className={styles.bubbleImage}
                    src={msg.attachment.dataUrl}
                    alt={msg.attachment.name || "Shared image"}
                  />
                )}
                {msg.attachment?.kind === "audio" && (
                  <VoiceNote
                    url={msg.attachment.dataUrl}
                    peaks={msg.attachment.peaks}
                    durationMs={msg.attachment.durationMs}
                    label={msg.attachment.name || "Voice note"}
                  />
                )}
                {msg.attachment?.kind === "recording" && (
                  <a
                    className={styles.fileChip}
                    href={msg.attachment.dataUrl}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className={styles.fileIcon}><Video size={13} /></span>
                    <span className={styles.fileMeta}>
                      <span className={styles.fileName}>{msg.attachment.name}</span>
                      <span className={styles.fileSize}>Recording</span>
                    </span>
                    <span className={styles.fileDownload}>Open</span>
                  </a>
                )}
                {msg.attachment && msg.attachment.kind !== "image" && msg.attachment.kind !== "audio" && msg.attachment.kind !== "recording" && (
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
                <div className={tStyles.bubbleMeta}>
                  <span className={styles.bubbleTime}>{chatTimeLabel(millis)}</span>
                  {isMine &&
                    (msg.sending ? (
                      <Check size={13} className={tStyles.tickSent} aria-label="Sending" />
                    ) : readByOthers ? (
                      <CheckCheck size={13} className={tStyles.tickRead} aria-label="Read" />
                    ) : (
                      <CheckCheck size={13} className={tStyles.tickDelivered} aria-label="Delivered" />
                    ))}
                </div>
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
                          <BubbleContent msg={reply} searchQuery={searchQuery.trim()} isReply onTag={(tag) => onSearchChange(tag)} />
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
        <div className={tStyles.typingRow} aria-live="polite" aria-atomic="true">
          {typingUsers.length > 0 && (
            <>
              <span className={tStyles.srOnly}>{typingLabel(typingUsers)}</span>
              <div
                className={`${styles.bubble} ${tStyles.typingBubble}`}
                aria-hidden="true"
              >
                <span className={tStyles.typingDot} />
                <span className={tStyles.typingDot} />
                <span className={tStyles.typingDot} />
              </div>
            </>
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      {showJump && (
        <button
          type="button"
          className={tStyles.jumpLatest}
          onClick={jumpToLatest}
          aria-label={newBelow > 0 ? `Jump to latest, ${newBelow} new` : "Jump to latest"}
        >
          <ChevronDown size={16} />
          {newBelow > 0 && (
            <span className={tStyles.jumpCount}>{newBelow > 99 ? "99+" : newBelow}</span>
          )}
        </button>
      )}

      {attachError && <p className={styles.attachError}>{attachError}</p>}
      {recordError && <p className={styles.attachError}>{recordError}</p>}
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
        {recording ? (
          <div className={styles.recordingBar}>
            <span className={styles.recordingDot} aria-hidden="true" />
            <span className={styles.recordingTime}>{formatVoiceDuration(recordMs)}</span>
            <span className={styles.recordingHint}>Recording…</span>
            <button
              type="button"
              className={styles.recordingCancel}
              onClick={() => stopRecording(true)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.send}
              onClick={() => stopRecording(false)}
            >
              Send
            </button>
          </div>
        ) : (
          <>
            <textarea
              ref={inputRef}
              className={styles.input}
              rows={1}
              placeholder="Type a message…"
              value={text}
              onChange={handleComposerChange}
              onKeyDown={handleKeyDown}
              onBlur={stopTyping}
              maxLength={2000}
            />
            <button
              type="button"
              className={styles.iconBtn}
              onClick={startRecording}
              disabled={busy}
              aria-label="Record a voice note"
              title="Record a voice note"
            >
              <Mic size={18} />
            </button>
            <button
              className={styles.send}
              type="submit"
              disabled={(!text.trim() && !attachment) || busy}
            >
              {busy ? "Sending…" : "Send"}
            </button>
          </>
        )}
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
