"use client";

import { useSyncExternalStore } from "react";
import BackButton from "@/components/BackButton";
import PresenceStatus from "../PresenceStatus";
import { Search, X } from "lucide-react";
import { subscribeTyping, getTypingState, typingLabel } from "@/lib/chat-typing-core";
import styles from "../chat.module.css";

const EMPTY_TYPING = [];

// The conversation header: avatar, name, presence (or a live typing line), then
// compact search that expands in place, plus call affordances. Typing is read
// from the ephemeral store the thread publishes to, so the subtitle flips to
// "typing…" without a round trip.
export default function ChatHeader({
  title,
  photoURL,
  conversationId,
  participantIds = [],
  conversationType,
  inLoungeName = "",
  searchOpen,
  searchQuery,
  onToggleSearch,
  onSearchChange,
}) {
  const typingNames = useSyncExternalStore(
    subscribeTyping,
    () => getTypingState()[conversationId] || EMPTY_TYPING,
    () => EMPTY_TYPING
  );

  const typingText = typingLabel(typingNames);
  const initial = (title || "?").trim().charAt(0).toUpperCase() || "?";
  const isGroup = conversationType === "group" || conversationType === "space";

  return (
    <div className={styles.threadHeaderWrap}>
      <div className={styles.threadHeader}>
        <div className={styles.threadHeaderLeft}>
          <div className={styles.threadBack}>
            <BackButton fallback="/chat" label="Chats" />
          </div>
          <div className={styles.headerAvatar} aria-hidden="true">
            {photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoURL} alt="" className={styles.headerAvatarImg} />
            ) : (
              <span>{initial}</span>
            )}
          </div>
          <div className={styles.headerIdentity}>
            <h1 className={styles.threadTitle}>{title || "Member"}</h1>
            {typingText ? (
              <span className={styles.typingLine}>{typingText}</span>
            ) : inLoungeName ? (
              <span className={styles.headerLounge}>In {inLoungeName}</span>
            ) : isGroup && participantIds.length > 0 ? (
              <PresenceStatus userIds={participantIds} />
            ) : participantIds.length > 0 ? (
              <PresenceStatus userId={participantIds[0]} />
            ) : null}
          </div>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.headerIconBtn}
            aria-label={searchOpen ? "Close search" : "Search messages"}
            title="Search messages"
            onClick={onToggleSearch}
          >
            {searchOpen ? <X size={17} /> : <Search size={17} />}
          </button>
        </div>
      </div>
      {searchOpen && (
        <div className={styles.headerSearchRow}>
          <Search size={15} className={styles.headerSearchIcon} aria-hidden="true" />
          <input
            className={styles.headerSearchInput}
            type="search"
            placeholder="Search this conversation…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            autoFocus
          />
        </div>
      )}
    </div>
  );
}
