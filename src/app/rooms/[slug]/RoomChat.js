"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  MessageCircle,
  Smile,
  Paperclip,
  SendHorizontal,
  Reply,
  AtSign,
  MessageSquareReply,
  Pin,
  Trash2,
  ChevronUp,
  Loader2,
  Clock,
  Lock,
  RefreshCcw,
  ShieldAlert,
  VolumeX,
  Ban,
} from "lucide-react";
import { useRoomData } from "./RoomDataProvider";
import ReportModal from "../../feed/ReportModal";
import { UPGRADE_URL } from "@/lib/upgrade-url";
import styles from "./room.module.css";

const EMOJI = ["❤️", "👍", "👏", "🎉", "😂", "🙌"];

function fileToImageData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const raw = typeof reader.result === "string" ? reader.result : "";
      const img = new Image();
      img.onerror = () => reject(new Error("decode"));
      img.onload = () => {
        if (raw.length <= 600 * 1024) {
          resolve(raw);
          return;
        }
        const maxDim = 720;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = raw;
    };
    reader.readAsDataURL(file);
  });
}

function ChatAvatar({ name, avatar }) {
  if (avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={styles.chatAvatarImg} src={avatar} alt="" />;
  }
  return <span className={styles.chatAvatar}>{(name || "?").charAt(0).toUpperCase()}</span>;
}

function ReactionChip({ emoji, userIds, onToggle, active }) {
  return (
    <button
      type="button"
      className={active ? `${styles.chatReactionChip} ${styles.chatReactionChipActive}` : styles.chatReactionChip}
      onClick={onToggle}
      aria-pressed={active}
    >
      {emoji} {userIds.length}
    </button>
  );
}

function MessageRow({ msg, hostId, currentUserId, canModerate, onToggleReaction, onReply, onReact, onRetry, onSafety, onReport }) {
  const t = useTranslations("rooms");
  const isHostUser = msg.role === "host" || (msg.userId && msg.userId === hostId);
  const isMe = msg.userId === currentUserId;
  const canModerateMsg = canModerate;
  const canDelete = canModerateMsg || isMe;
  const canPin = canModerateMsg;
  const { togglePin, deleteMessage } = useRoomData();
  const time = new Date(msg.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={
        isMe ? `${styles.chatRow} ${styles.chatRowMe}` : styles.chatRow
      }
    >
      <ChatAvatar name={msg.userName} avatar={msg.userAvatar} />
      <div className={styles.chatRowBody}>
        <div className={styles.chatRowMeta}>
          <span className={styles.chatRowName}>{msg.userName}</span>
          {isHostUser && <span className={styles.chatBadgeHost}>{t("host")}</span>}
          {msg.role === "moderator" && !isHostUser && (
            <span className={styles.chatBadgeMod}>{t("moderator")}</span>
          )}
          <span className={styles.chatRowTime}>{time}</span>
        </div>
        {msg.deleted ? (
          <div className={msg.isLocal ? `${styles.chatBubble} ${styles.chatBubbleMe}` : styles.chatBubble}>
            <p className={styles.chatDeleted}>{t("messageDeleted")}</p>
          </div>
        ) : (
          <>
            {msg.replyTo && (
              <span className={styles.chatReplyTo}>
                <MessageSquareReply size={12} />
                {t("replyingTo", { name: msg.replyTo.from || "" })}
              </span>
            )}
            <div className={msg.isLocal ? `${styles.chatBubble} ${styles.chatBubbleMe}` : styles.chatBubble}>
              {msg.imageData && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.chatImage} src={msg.imageData} alt="" />
              )}
              <p className={styles.chatText}>
                {msg.mentions && msg.mentions.length > 0 && (
                  <span className={styles.chatMention}>
                    <AtSign size={12} />@
                  </span>
                )}
                {msg.text}
                {msg.isLocal && msg.failed && (
                  <span className={styles.chatFailed} title={t("sendFailed")}>
                    <Clock size={12} />
                  </span>
                )}
              </p>
              {msg.isLocal && msg.failed && (
                <button type="button" className={styles.chatRetry} onClick={() => onRetry && onRetry(msg)}>
                  <RefreshCcw size={12} /> Retry
                </button>
              )}
              {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                <div className={styles.chatReactions}>
                  {Object.entries(msg.reactions).map(([emoji, userIds]) => (
                    <ReactionChip
                      key={emoji}
                      emoji={emoji}
                      userIds={userIds}
                      active={(userIds || []).includes(currentUserId)}
                      onToggle={() => onToggleReaction && onToggleReaction(msg.id, emoji)}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className={styles.chatActions}>
              <button
                type="button"
                className={styles.chatActionBtn}
                title={t("react")}
                onClick={() => onReact && onReact(msg.id, "❤️")}
              >
                <Smile size={13} />
              </button>
              <button
                type="button"
                className={styles.chatActionBtn}
                title={t("reply")}
                onClick={() => onReply && onReply(msg)}
              >
                <Reply size={13} />
              </button>
              {canPin && (
                <button
                  type="button"
                  className={msg.pinned ? `${styles.chatActionBtn} ${styles.chatActionOn}` : styles.chatActionBtn}
                  title={t("pin")}
                  onClick={() => togglePin && togglePin(msg.id)}
                >
                  <Pin size={13} />
                </button>
              )}
              {!isMe && (
                <>
                  <button type="button" className={styles.chatActionBtn} title="Mute member" onClick={() => onSafety?.(msg, "mute")}>
                    <VolumeX size={13} />
                  </button>
                  <button type="button" className={`${styles.chatActionBtn} ${styles.chatActionDanger}`} title="Block member" onClick={() => onSafety?.(msg, "block")}>
                    <Ban size={13} />
                  </button>
                  <button type="button" className={styles.chatActionBtn} title="Report message" onClick={() => onReport?.(msg)}>
                    <ShieldAlert size={13} />
                  </button>
                </>
              )}
              {canDelete && (
                <button
                  type="button"
                  className={`${styles.chatActionBtn} ${styles.chatActionDanger}`}
                  title={t("delete")}
                  onClick={() => deleteMessage && deleteMessage(msg.id)}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function RoomChat({ hostId, currentUserId, participantCount = 0, roomConnected = false, canWriteChat = true, planKey = "flirting" }) {
  const t = useTranslations("rooms");
  const {
    messages,
    roomId,
    loadingHistory,
    hasMore,
    loadEarlier,
    chatError,
    canModerate,
    sendChatMessage,
    retryChatMessage,
    toggleReaction,
    hideUser,
    onMuteParticipant,
  } = useRoomData();
  const [draft, setDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [unread, setUnread] = useState(0);
  const [attachBusy, setAttachBusy] = useState(false);
  const [reportMessage, setReportMessage] = useState(null);
  const [safetyBusy, setSafetyBusy] = useState("");
  const [safetyNotice, setSafetyNotice] = useState("");
  const listRef = useRef(null);
  const composerRef = useRef(null);
  const fileInputRef = useRef(null);
  const nearBottomRef = useRef(true);
  const prevLenRef = useRef(0);
  const canPost = canWriteChat || canModerate;

  async function handleSafety(message, action) {
    const targetId = message?.userId;
    if (!targetId || safetyBusy) return;
    setSafetyBusy(`${action}:${targetId}`);
    setSafetyNotice("");
    try {
      const res = await fetch("/api/members/safety", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not update safety settings");
      if (action === "mute") onMuteParticipant?.(message.userId, message.userName);
      if (action === "block") hideUser?.(targetId);
      setSafetyNotice(action === "block" ? "Member blocked and hidden from this room." : "Member muted for you.");
    } catch (error) {
      setSafetyNotice(error.message || "Could not update safety settings");
    } finally {
      setSafetyBusy("");
    }
  }

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      nearBottomRef.current = distance < 80;
      if (nearBottomRef.current) setUnread(0);
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      setUnread(0);
    } else if (messages.length > prevLenRef.current) {
      setUnread((u) => u + (messages.length - prevLenRef.current));
    }
    prevLenRef.current = messages.length;
  }, [messages.length]);

  function scrollToBottom() {
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      nearBottomRef.current = true;
      setUnread(0);
    }
  }

  function submit() {
    if (!draft.trim()) return;
    sendChatMessage(
      draft,
      replyingTo ? { id: replyingTo.id, text: replyingTo.text, from: replyingTo.userName } : null,
      []
    );
    setDraft("");
    setReplyingTo(null);
    scrollToBottom();
  }

  function handleMention() {
    const val = draft + "@";
    setDraft(val);
    composerRef.current && composerRef.current.focus();
  }

  async function handleAttach(e) {
    const file = e.target.files && e.target.files[0];
    if (e.target.value) e.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpe?g|gif|webp)/.test(file.type)) return;
    setAttachBusy(true);
    try {
      const imageData = await fileToImageData(file);
      if (!imageData) return;
      sendChatMessage(
        draft,
        replyingTo ? { id: replyingTo.id, text: replyingTo.text, from: replyingTo.userName } : null,
        [],
        imageData
      );
      setDraft("");
      setReplyingTo(null);
      scrollToBottom();
    } catch {
      /* ignored */
    } finally {
      setAttachBusy(false);
    }
  }

  return (
    <div className={styles.chat}>
      <div className={styles.chatHeader}>
        <div className={styles.chatHeaderLeft}>
          <MessageCircle size={17} className={styles.chatHeaderIcon} />
          <span className={styles.chatHeaderTitle}>{t("liveChat")}</span>
          <span className={styles.chatHeaderCount}>
            {t("peopleInRoom", { count: participantCount })}
          </span>
        </div>
        <div className={styles.chatHeaderStatus}>
          <span className={styles.chatPresence} data-active={roomConnected ? "true" : "false"}>
            <span className={styles.chatPresenceDot} aria-hidden="true" />
            {roomConnected ? "Live now" : "Connecting…"}
          </span>
          <span className={styles.chatHeaderPinned}>
            <MessageCircle size={13} /> {t("liveChat")}
          </span>
        </div>
      </div>

      <div className={styles.chatMessages} ref={listRef} aria-live="polite">
        {loadingHistory ? (
          <div className={styles.chatEmpty}>
            <Loader2 size={16} className={styles.loadingSpin} />
            <span>{t("loadingChat")}</span>
          </div>
        ) : messages.length === 0 ? (
          <div className={styles.chatEmpty}>{t("beFirst")}</div>
        ) : (
          <>
            {hasMore && (
              <button type="button" className={styles.loadEarlier} onClick={loadEarlier}>
                <ChevronUp size={14} /> {t("loadEarlier")}
              </button>
            )}
            {messages.map((m) => (
              <MessageRow
                key={m.id}
                msg={m}
                hostId={hostId}
                currentUserId={currentUserId}
                canModerate={canModerate}
                onToggleReaction={toggleReaction}
                onReact={(messageId, emoji) => toggleReaction(messageId, emoji)}
                onRetry={retryChatMessage}
                onReply={(msg) => {
                  setReplyingTo(msg);
                  composerRef.current && composerRef.current.focus();
                }}
                onSafety={handleSafety}
                onReport={setReportMessage}
              />
            ))}
          </>
        )}
      </div>

      {unread > 0 && (
        <button type="button" className={styles.unreadPill} onClick={scrollToBottom}>
          {t("newMessages", { count: unread })} <ChevronUp size={13} />
        </button>
      )}

      {replyingTo && (
        <div className={styles.replyingBar}>
          <MessageSquareReply size={13} />
          <span>
            {t("replyingTo", { name: replyingTo.userName || "" })}
          </span>
          <button
            type="button"
            className={styles.replyingClose}
            onClick={() => setReplyingTo(null)}
            aria-label={t("cancel")}
          >
            ×
          </button>
        </div>
      )}

      {chatError && <div className={styles.chatError}>{chatError}</div>}
      {safetyNotice && <div className={styles.chatError} role="status">{safetyNotice}</div>}
      {reportMessage && (
        <ReportModal
          type="room_message"
          targetId={reportMessage.id}
          roomId={roomId}
          onClose={() => setReportMessage(null)}
        />
      )}

      {!canPost && (
        <div className={styles.upgradePrompt}>
          <Lock size={15} className={styles.upgradePromptIcon} />
          <span>{t("upgradeToChat")}</span>
          <a className={styles.upgradePromptLink} href={UPGRADE_URL} target="_blank" rel="noopener noreferrer">
            {t("upgrade")}
          </a>
        </div>
      )}

      {canPost && (
      <div className={styles.composer}>
        {showEmoji && (
          <div className={styles.emojiPanel}>
            {EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                className={styles.emojiBtn}
                onClick={() => {
                  setDraft((d) => d + e);
                  composerRef.current && composerRef.current.focus();
                  setShowEmoji(false);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className={styles.composerIconBtn}
          title={t("emoji")}
          onClick={() => setShowEmoji((v) => !v)}
        >
          <Smile size={18} />
        </button>
        <button
          type="button"
          className={styles.composerIconBtn}
          title={t("attach")}
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          disabled={attachBusy}
        >
          {attachBusy ? <Loader2 size={18} className={styles.loadingSpin} /> : <Paperclip size={18} />}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className={styles.hiddenInput}
          onChange={handleAttach}
          aria-hidden="true"
          tabIndex={-1}
        />
        <button
          type="button"
          className={styles.composerIconBtn}
          title={t("mention")}
          onClick={handleMention}
        >
          <AtSign size={18} />
        </button>
        <input
          ref={composerRef}
          className={styles.composerInput}
          placeholder={t("writeMessage")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          aria-label={t("writeMessage")}
        />
        <button
          type="button"
          className={styles.composerSend}
          onClick={submit}
          title={t("send")}
          disabled={!draft.trim()}
        >
          <SendHorizontal size={18} />
        </button>
      </div>
      )}
    </div>
  );
}
