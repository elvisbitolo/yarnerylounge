"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { subscribeInbox } from "@/lib/chat-realtime";
import { chatListTime } from "@/lib/chat-time";
import styles from "./chat.module.css";

function initial(name) {
  return (name || "?").slice(0, 1).toUpperCase();
}

function unread(conv) {
  return (conv.lastMessageAt || 0) > (conv.lastReadAt || 0);
}

export default function ConversationRail({ conversations, activeId, selfUid }) {
  const router = useRouter();
  const [convs, setConvs] = useState(conversations);
  const [prevConversations, setPrevConversations] = useState(conversations);
  const [query, setQuery] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [members, setMembers] = useState([]);
  const [searching, setSearching] = useState(false);
  const [startError, setStartError] = useState("");

  // Keep the list in sync with fresh server props from navigation without
  // triggering cascading renders (state adjusted during render).
  if (conversations !== prevConversations) {
    setPrevConversations(conversations);
    setConvs(conversations);
  }

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return convs;
    return convs.filter((c) =>
      (c.title || "").toLowerCase().includes(q) ||
      (c.lastMessage || "").toLowerCase().includes(q)
    );
  }, [convs, query]);

  return (
    <aside className={styles.rail}>
      <div className={styles.railHead}>
        <div className={styles.railTitleRow}>
          <h1 className={styles.railTitle}>Chats</h1>
          <button
            type="button"
            className={styles.newChatBtn}
            onClick={() => setShowNewChat((v) => !v)}
            aria-expanded={showNewChat}
          >
            {showNewChat ? "Done" : "+ New chat"}
          </button>
        </div>
        <input
          className={styles.railSearch}
          type="search"
          placeholder="Search chats…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search chats"
        />
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

      <div className={styles.railListWrap}>
        {filtered.length === 0 ? (
          <p className={styles.railEmpty}>
            {query
              ? "No chats match your search."
              : "No conversations yet. Start one with + New chat."}
          </p>
        ) : (
          <ul className={styles.railList}>
            {filtered.map((conv) => {
              const isActive = conv.id === activeId;
              const unreadChat = unread(conv);
              return (
                <li key={conv.id}>
                  <Link
                    href={`/chat/${conv.id}`}
                    className={`${styles.railItem} ${isActive ? styles.railItemActive : ""}`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <span className={`${styles.railAvatar} ${unreadChat ? styles.railAvatarUnread : ""}`}>
                      {initial(conv.title)}
                    </span>
                    <span className={styles.railBody}>
                      <span className={styles.railTop}>
                        <span className={`${styles.railName} ${unreadChat ? styles.railNameUnread : ""}`}>
                          {conv.title}
                        </span>
                        <span className={styles.railTime}>{chatListTime(conv.lastMessageAt)}</span>
                      </span>
                      <span className={`${styles.railPreview} ${unreadChat ? styles.railPreviewUnread : ""}`}>
                        {conv.lastMessage || "Say hi!"}
                      </span>
                    </span>
                    {unreadChat && <span className={styles.unreadDot} aria-label="Unread" />}
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