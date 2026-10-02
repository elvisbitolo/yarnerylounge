"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck, Eye, EyeOff } from "lucide-react";
import { subscribeInbox } from "@/lib/chat-realtime";
import { chatListTime } from "@/lib/chat-time";
import {
  subscribeTyping,
  getTypingState,
  subscribeTypingHidden,
  getTypingHidden,
  getTypingHiddenServer,
  setTypingHidden,
} from "@/lib/chat-typing-core";
import styles from "./chat.module.css";

const EMPTY_TYPING = {};

// Lounges are the "space" conversations; groups are the multi-member chats.
const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "lounges", label: "Lounges" },
  { key: "groups", label: "Groups" },
];

function initial(name) {
  return (name || "?").slice(0, 1).toUpperCase();
}

function unread(conv) {
  return (conv.unreadCount || 0) > 0 || (conv.lastMessageAt || 0) > (conv.lastReadAt || 0);
}

function matchesFilter(conv, filter) {
  if (filter === "unread") return unread(conv);
  if (filter === "lounges") return conv.type === "space";
  if (filter === "groups") return conv.type === "group";
  return true;
}

export default function ConversationRail({ conversations, activeId, selfUid }) {
  const router = useRouter();
  const [convs, setConvs] = useState(conversations);
  const prevConversationsRef = useRef(conversations);
  const [query, setQuery] = useState("");
  const [listFilter, setListFilter] = useState("all");
  const [showNewChat, setShowNewChat] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [members, setMembers] = useState([]);
  const [searching, setSearching] = useState(false);
  const [startError, setStartError] = useState("");
  const [liveRooms, setLiveRooms] = useState([]);

  // Typing is ephemeral and published by the open thread, so the list preview
  // reads the same store the header uses.
  const typingByConversation = useSyncExternalStore(
    subscribeTyping,
    getTypingState,
    () => EMPTY_TYPING
  );

  // Privacy setting: when hidden, we stop broadcasting our own typing dots.
  const typingHidden = useSyncExternalStore(
    subscribeTypingHidden,
    getTypingHidden,
    getTypingHiddenServer
  );

  useEffect(() => {
    if (conversations === prevConversationsRef.current) return;
    prevConversationsRef.current = conversations;
    setConvs(conversations);
  }, [conversations]);

  // Live inbox: when any of the member's conversations changes (a message
  // lands, read state moves), refresh the list so previews and order stay
  // current without a page reload. The 30s poll is only a fallback.
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    async function onEvent() {
      try {
        const res = await fetch("/api/conversations", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.conversations)) setConvs(data.conversations);
        }
      } catch {
        // keep the current list; the next event or poll retries
      }
    }

    subscribeInbox({ onEvent })
      .then((stop) => {
        if (disposed) stop();
        else cleanup = stop;
      })
      .catch(() => {});

    const timer = setInterval(onEvent, 30_000);

    return () => {
      disposed = true;
      cleanup();
      clearInterval(timer);
    };
  }, []);

  // "Live now" strip: which lounges have people in them right now. Replaces the
  // old page-wide pink banner with a compact, actionable row inside the list.
  useEffect(() => {
    let disposed = false;
    async function loadLive() {
      try {
        const res = await fetch("/api/rooms/live", { cache: "no-store" });
        const data = res.ok ? await res.json() : null;
        if (!disposed && Array.isArray(data?.rooms)) setLiveRooms(data.rooms);
      } catch {
        // keep the last strip; the next tick retries
      }
    }
    loadLive();
    const timer = setInterval(loadLive, 30_000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!showNewChat) return;
    const q = memberQuery.trim();
    if (q.length < 2) {
      // defer the clear so it never runs synchronously inside the effect body
      const clearTimer = setTimeout(() => {
        setMembers([]);
        setSearching(false);
      }, 0);
      return () => clearTimeout(clearTimer);
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/members/mention?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const data = res.ok ? await res.json() : { members: [] };
        const list = (data.members || []).filter((m) => m.uid !== selfUid);
        setMembers(list.slice(0, 8));
      } catch {
        setMembers([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [memberQuery, showNewChat, selfUid]);

  async function startWith(member) {
    setStartError("");
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "dm", otherId: member.uid }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStartError(data?.error || "Couldn't start the chat");
        return;
      }
      setShowNewChat(false);
      setMemberQuery("");
      router.push(`/chat/${data.conversation.id}`);
    } catch {
      setStartError("Couldn't start the chat");
    }
  }

  const unreadCount = useMemo(() => convs.filter(unread).length, [convs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = convs.filter((c) => matchesFilter(c, listFilter));
    if (!q) return list;
    return list.filter((c) =>
      (c.title || "").toLowerCase().includes(q) ||
      (c.lastMessage || "").toLowerCase().includes(q)
    );
  }, [convs, query, listFilter]);

  return (
    <aside className={styles.rail}>
      <div className={styles.railHead}>
        <div className={styles.railTitleRow}>
          <h1 className={styles.railTitle}>Chats</h1>
          <div className={styles.railTitleActions}>
            <button
              type="button"
              className={styles.iconToggle}
              onClick={() => setTypingHidden(!typingHidden)}
              aria-pressed={typingHidden}
              aria-label={typingHidden ? "Show my typing indicator" : "Hide my typing indicator"}
              title={typingHidden ? "Show my typing indicator" : "Hide my typing indicator"}
            >
              {typingHidden ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            <button
              type="button"
              className={styles.newChatBtn}
              onClick={() => setShowNewChat((v) => !v)}
              aria-expanded={showNewChat}
            >
              {showNewChat ? "Done" : "+ New chat"}
            </button>
          </div>
        </div>
        <input
          className={styles.railSearch}
          type="search"
          placeholder="Search chats…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search chats"
        />
        <div className={styles.railTabs} role="tablist" aria-label="Filter chats">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              role="tab"
              aria-selected={listFilter === filter.key}
              className={`${styles.railTab} ${listFilter === filter.key ? styles.railTabActive : ""}`}
              onClick={() => setListFilter(filter.key)}
            >
              {filter.label}
              {filter.key === "unread" && unreadCount > 0 && (
                <span className={styles.railTabCount}>{unreadCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {showNewChat && (
        <div className={styles.newChatPanel}>
          <input
            className={styles.railSearch}
            type="search"
            placeholder="Find a member by name…"
            value={memberQuery}
            onChange={(e) => setMemberQuery(e.target.value)}
            autoFocus
            aria-label="Find a member"
          />
          {startError && <p className={styles.startError}>{startError}</p>}
          {searching && <p className={styles.memberStatus}>Searching…</p>}
          {!searching && memberQuery.trim().length >= 2 && members.length === 0 && (
            <p className={styles.memberStatus}>No members found yet.</p>
          )}
          {members.length > 0 && (
            <ul className={styles.memberList}>
              {members.map((m) => (
                <li key={m.uid}>
                  <button
                    type="button"
                    className={styles.memberRow}
                    onClick={() => startWith(m)}
                  >
                    <span className={styles.railAvatar}>{initial(m.name)}</span>
                    <span className={styles.memberName}>{m.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {liveRooms.length > 0 && (
        <div className={styles.liveStrip}>
          <span className={styles.liveLabel}>
            <span className={styles.livePulse} aria-hidden="true" />
            Live now
          </span>
          <div className={styles.liveRooms}>
            {liveRooms.slice(0, 3).map((room) => (
              <Link key={room.id} href={`/rooms/${room.slug}`} className={styles.liveRoom}>
                <span className={styles.liveRoomName}>{room.name}</span>
                <span className={styles.liveRoomCount}>
                  {room.viewers > 0 ? `+${room.viewers} live` : "Open"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className={styles.railListWrap}>
        {filtered.length === 0 ? (
          <p className={styles.railEmpty}>
            {query
              ? "No chats match your search."
              : listFilter === "unread"
                ? "You're all caught up."
                : "No conversations yet. Start one with + New chat."}
          </p>
        ) : (
          <ul className={styles.railList}>
            {filtered.map((conv) => {
              const isActive = conv.id === activeId;
              const unreadChat = unread(conv);
              const typingNames = typingByConversation[conv.id] || [];
              const previewText = typingNames.length > 0 ? "typing…" : conv.lastMessage || "Say hi!";
              const mine = !!conv.lastSenderId && conv.lastSenderId === selfUid;
              return (
                <li key={conv.id}>
                  <Link
                    href={`/chat/${conv.id}`}
                    className={`${styles.railItem} ${isActive ? styles.railItemActive : ""} ${
                      unreadChat ? styles.railItemUnread : ""
                    }`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <span
                      className={`${styles.railAvatar} ${unreadChat ? styles.railAvatarUnread : ""}`}
                      style={conv.photoURL ? { backgroundImage: `url(${conv.photoURL})` } : undefined}
                    >
                      {!conv.photoURL && initial(conv.title)}
                    </span>
                    <span className={styles.railBody}>
                      <span className={styles.railTop}>
                        <span className={`${styles.railName} ${unreadChat ? styles.railNameUnread : ""}`}>
                          {conv.title}
                        </span>
                        <span className={styles.railTime}>{chatListTime(conv.lastMessageAt)}</span>
                      </span>
                      <span className={styles.railBottom}>
                        <span
                          className={`${styles.railPreview} ${
                            typingNames.length > 0
                              ? styles.railPreviewTyping
                              : unreadChat
                                ? styles.railPreviewUnread
                                : ""
                          }`}
                        >
                          {previewText}
                        </span>
                        {mine && (
                          <CheckCheck size={13} className={styles.railTicks} aria-label="Delivered" />
                        )}
                        {unreadChat && conv.unreadCount > 0 && (
                          <span className={styles.unreadBadge}>
                            {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className={styles.railChevron} aria-hidden="true">›</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}