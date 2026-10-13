"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck, Eye, EyeOff, Pin, Settings2 } from "lucide-react";
import { subscribeInbox } from "@/lib/chat-realtime";
import { chatListTime } from "@/lib/chat-time";
import { hasSearchQuery } from "@/lib/chat-search-core";
import { applyPrefsToConversations } from "@/lib/chat-settings-core";
import { getChatPrefs, initChatPrefs, saveChatSettings, useChatPrefs } from "@/lib/chat-prefs-store";
import { initAppearance } from "@/lib/chat-appearance-store";
import { shouldPlayMessageSound, playMessageChime } from "@/lib/chat-sound";
import {
  subscribeTyping,
  getTypingState,
  subscribeTypingHidden,
  getTypingHidden,
  getTypingHiddenServer,
  setTypingHidden,
} from "@/lib/chat-typing-core";
import ChatSettingsPanel from "./ChatSettingsPanel";
import styles from "./chat.module.css";

const EMPTY_TYPING = {};

// Lounges are the "space" conversations; groups are the multi-member chats.
// Archived conversations only surface through their own filter.
const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "lounges", label: "Lounges" },
  { key: "groups", label: "Groups" },
  { key: "archived", label: "Archived" },
];

function initial(name) {
  return (name || "?").slice(0, 1).toUpperCase();
}

function unread(conv) {
  return (conv.unreadCount || 0) > 0 || (conv.lastMessageAt || 0) > (conv.lastReadAt || 0);
}

function matchesFilter(conv, filter) {
  if (filter === "archived") return conv.archived === true;
  if (filter === "unread") return unread(conv) && !conv.archived;
  if (filter === "lounges") return conv.type === "space" && !conv.archived;
  if (filter === "groups") return conv.type === "group" && !conv.archived;
  return !conv.archived;
}

export default function ConversationRail({
  conversations,
  activeId,
  selfUid,
  settingsInit,
  prefsByIdInit,
  appearanceInit = null,
}) {
  const router = useRouter();
  const [convs, setConvs] = useState(conversations);
  const prevConversationsRef = useRef(conversations);
  // Snapshot of last-seen inbox state per conversation id, used to decide when
  // a *new* message arrived (so the chime stays silent for things already seen).
  const lastInboxByRef = useRef(null);
  const [query, setQuery] = useState("");
  const [listFilter, setListFilter] = useState("all");
  const [showNewChat, setShowNewChat] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [members, setMembers] = useState([]);
  const [searching, setSearching] = useState(false);
  const [startError, setStartError] = useState("");
  const [liveRooms, setLiveRooms] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Results from the server search: conversations whose *message history*
  // matches, and every member whose name/username matches. Seeded empty and
  // refreshed on a debounce so typing stays instant.
  const [historyHits, setHistoryHits] = useState([]);
  const [memberHits, setMemberHits] = useState([]);
  const [remoteSearching, setRemoteSearching] = useState(false);

  // Global settings + per-conversation prefs live in the shared store so the
  // rail, the settings drawer and the chat-info drawer stay in sync.
  const chatPrefs = useChatPrefs();

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

  // Seed the shared prefs store once per mount from the server-rendered
  // snapshot; the server stays the source of truth for everything that
  // survives a reload.
  useEffect(() => {
    initChatPrefs({ settings: settingsInit, prefsById: prefsByIdInit });
    initAppearance(appearanceInit);
    // A server snapshot wins over a stale local flag until the drawer writes
    // a new value.
    if (typeof settingsInit?.typingHidden === "boolean") {
      setTypingHidden(settingsInit.typingHidden);
    }
    // The first inbox snapshot is the conversation list we rendered with, so a
    // fresh poll never chimes for messages that were already on screen.
    lastInboxByRef.current = Object.fromEntries(
      (conversations || []).map((conv) => [conv.id, conv])
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          if (Array.isArray(data.conversations)) {
            const incoming = data.conversations;
            // Play the chime when a *new* message from someone else lands in a
            // conversation that has sounds on and isn't muted. Diffing against
            // the previous snapshot keeps repeats (refresh / own reads) silent.
            const before = lastInboxByRef.current || null;
            const live = getChatPrefs();
            if (before && live.settings.messageSound !== false) {
              for (const conv of incoming) {
                const prev = before[conv.id];
                const hasNewMessage =
                  (conv.lastMessageAt || 0) > (prev?.lastMessageAt || 0) &&
                  conv.lastSenderId &&
                  conv.lastSenderId !== selfUid;
                if (!hasNewMessage) continue;
                const rawPrefs = live.prefs[conv.id] || {};
                const mutedByConv =
                  rawPrefs.muted === true ||
                  (rawPrefs.mutedUntil || 0) > Date.now();
                if (shouldPlayMessageSound({ messageSound: live.settings.messageSound, muted: mutedByConv, fromSelf: false })) {
                  playMessageChime();
                }
              }
            }
            lastInboxByRef.current = Object.fromEntries(incoming.map((c) => [c.id, c]));
            setConvs(incoming);
          }
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
  }, [selfUid]);

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

  // Full-history + member search. The list below still filters locally for an
  // instant response; this only adds what the client cannot know — matches
  // buried in message history, and members the viewer has no chat with yet.
  useEffect(() => {
    const q = query.trim();
    if (!hasSearchQuery(q)) {
      // defer the clear so it never runs synchronously inside the effect body
      const clearTimer = setTimeout(() => {
        setHistoryHits([]);
        setMemberHits([]);
        setRemoteSearching(false);
      }, 0);
      return () => clearTimeout(clearTimer);
    }
    let active = true;
    const t = setTimeout(async () => {
      if (active) setRemoteSearching(true);
      try {
        const res = await fetch(`/api/chat/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const data = res.ok ? await res.json() : null;
        if (!active) return;
        setHistoryHits(Array.isArray(data?.conversations) ? data.conversations : []);
        setMemberHits(Array.isArray(data?.members) ? data.members : []);
      } catch {
        if (active) {
          setHistoryHits([]);
          setMemberHits([]);
        }
      } finally {
        if (active) setRemoteSearching(false);
      }
    }, 220);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query]);

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

  async function toggleTypingHidden() {
    const next = !typingHidden;
    const updated = await saveChatSettings({ typingHidden: next });
    if (updated) setTypingHidden(next);
  }

  // Live pin/archive/mute flags: the store mirrors per-conversation pref writes
  // immediately, so a just-pinned chat jumps to the top without a reload. Pinned
  // chats sort first (most recent pin wins), then by recency.
  const convsByPref = useMemo(
    () =>
      applyPrefsToConversations(convs, chatPrefs.prefs).sort(
        (a, b) =>
          (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
          (b.pinnedAt || b.updatedAt) - (a.pinnedAt || a.updatedAt)
      ),
    [convs, chatPrefs.prefs]
  );

  const unreadCount = useMemo(() => convsByPref.filter(unread).length, [convsByPref]);

  const historyById = useMemo(() => {
    const map = new Map();
    for (const hit of historyHits) map.set(hit.conversationId, hit);
    return map;
  }, [historyHits]);

  // Local title/last-message matches stay first (instant and familiar); then the
  // conversations the server found by full message history, in its recency
  // order. Rows carry the snippet so the list says *why* a chat matched.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = convsByPref.filter((c) => matchesFilter(c, listFilter));
    if (!q) return list.map((c) => ({ conv: c, snippet: "", matchCount: 0 }));

    const localMatches = list.filter(
      (c) =>
        (c.title || "").toLowerCase().includes(q) ||
        (c.lastMessage || "").toLowerCase().includes(q)
    );
    const localIds = new Set(localMatches.map((c) => c.id));
    const order = new Map(historyHits.map((hit, index) => [hit.conversationId, index]));
    const historyMatches = list
      .filter((c) => !localIds.has(c.id) && historyById.has(c.id))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    return [...localMatches, ...historyMatches].map((c) => {
      const hit = historyById.get(c.id);
      return {
        conv: c,
        snippet: hit?.snippets?.[0]?.text || "",
        matchCount: hit?.matchCount || 0,
      };
    });
  }, [convsByPref, query, listFilter, historyHits, historyById]);

  const searchActive = hasSearchQuery(query);

  return (
    <aside className={styles.rail}>
      <div className={styles.railHead}>
        <div className={styles.railTitleRow}>
          <h1 className={styles.railTitle}>Chats</h1>
          <div className={styles.railTitleActions}>
            <button
              type="button"
              className={styles.iconToggle}
              onClick={() => setSettingsOpen(true)}
              aria-pressed={settingsOpen}
              aria-label="Chat settings"
              title="Chat settings"
            >
              <Settings2 size={15} />
            </button>
            <button
              type="button"
              className={styles.iconToggle}
              onClick={toggleTypingHidden}
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
        {searchActive && memberHits.length > 0 && (
          <div className={styles.searchSection}>
            <p className={styles.searchSectionLabel}>Members</p>
            <ul className={styles.memberList}>
              {memberHits.map((m) => (
                <li key={m.uid}>
                  <button
                    type="button"
                    className={styles.memberRow}
                    onClick={() => startWith(m)}
                  >
                    <span
                      className={styles.railAvatar}
                      style={m.photoURL ? { backgroundImage: `url(${m.photoURL})` } : undefined}
                    >
                      {!m.photoURL && initial(m.name)}
                    </span>
                    <span className={styles.memberName}>{m.name || "Member"}</span>
                    {m.username && <span className={styles.memberUsername}>@{m.username}</span>}
                    <span className={styles.memberAction}>Message</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {searchActive && (
          <p className={styles.searchSectionLabel}>
            Chats
            {remoteSearching && <span className={styles.searchNote}> · searching…</span>}
          </p>
        )}

        {filtered.length === 0 ? (
          <p className={styles.railEmpty}>
            {query
              ? memberHits.length > 0
                ? "No chats match — but you can message someone above."
                : "No chats match your search."
              : listFilter === "unread"
                ? "You're all caught up."
                : "No conversations yet. Start one with + New chat."}
          </p>
        ) : (
          <ul className={styles.railList}>
            {filtered.map(({ conv, snippet, matchCount }) => {
              const isActive = conv.id === activeId;
              const unreadChat = unread(conv);
              const typingNames = typingByConversation[conv.id] || [];
              const previewText =
                typingNames.length > 0 ? "typing…" : snippet || conv.lastMessage || "Say hi!";
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
                          {conv.pinned && (
                            <Pin size={12} className={styles.railPin} aria-label="Pinned" />
                          )}
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
                        {snippet && matchCount > 1 && typingNames.length === 0 && (
                          <span className={styles.matchBadge} title={`${matchCount} matching messages`}>
                            {matchCount > 99 ? "99+" : matchCount}
                          </span>
                        )}
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

      <ChatSettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </aside>
  );
}