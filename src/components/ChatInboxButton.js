"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, Search, X } from "lucide-react";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import styles from "./ChatInboxButton.module.css";

function timeLabel(millis) {
  if (!millis) return "";
  const date = new Date(millis);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ChatInboxButton() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [summary, setSummary] = useState({ unread: 0, conversations: [] });
  const panelRef = useRef(null);
  const buttonRef = useRef(null);
  const panelId = "chat-inbox-panel";

  useEffect(() => {
    let cleanup = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (cleanup) cleanup();
      cleanup = null;
      if (!user) {
        setSummary({ unread: 0, conversations: [] });
        setOpen(false);
        return;
      }
      let active = true;
      let timer = null;
      const load = async () => {
        try {
          const response = await fetch("/api/chat/summary", { cache: "no-store" });
          if (!response.ok) return;
          const data = await response.json();
          if (active) setSummary({ unread: Number(data.unread) || 0, conversations: Array.isArray(data.conversations) ? data.conversations : [] });
        } catch {
          // The inbox remains usable through the full Chat page if this refresh fails.
        }
      };
      const onVisible = () => {
        if (document.visibilityState === "visible") load();
      };
      document.addEventListener("visibilitychange", onVisible);
      load();
      timer = setInterval(load, 20_000);
      cleanup = () => {
        active = false;
        if (timer) clearInterval(timer);
        document.removeEventListener("visibilitychange", onVisible);
      };
    });
    return () => {
      unsubAuth();
      if (cleanup) cleanup();
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!panelRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const visible = filter === "unread"
    ? summary.conversations.filter((conversation) => conversation.lastMessageAt > (conversation.lastReadAt || 0))
    : summary.conversations;

  const unreadLabel = summary.unread > 99 ? "99+" : summary.unread;

  return (
    <div className={styles.wrap} ref={panelRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.button}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        aria-label={summary.unread > 0 ? `Chat, ${unreadLabel} unread` : "Chat"}
        title="Chat"
      >
        <MessageCircle size={19} />
        {summary.unread > 0 && <span className={styles.badge}>{unreadLabel}</span>}
      </button>

      {open && (
        <section id={panelId} className={styles.panel} aria-label="Chat inbox">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Messages</p>
              <h2 className={styles.title}>Your chats</h2>
            </div>
            <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close chat inbox">
              <X size={17} />
            </button>
          </div>
          <div className={styles.filters} role="tablist" aria-label="Chat filters">
            <button type="button" className={filter === "all" ? styles.filterActive : styles.filter} onClick={() => setFilter("all")} aria-pressed={filter === "all"}>All</button>
            <button type="button" className={filter === "unread" ? styles.filterActive : styles.filter} onClick={() => setFilter("unread")} aria-pressed={filter === "unread"}>Unread{summary.unread > 0 ? ` · ${summary.unread}` : ""}</button>
          </div>
          {visible.length === 0 ? (
            <div className={styles.empty}>
              <Search size={18} />
              <p>{filter === "unread" ? "You are all caught up." : "No conversations yet."}</p>
            </div>
          ) : (
            <div className={styles.list}>
              {visible.map((conversation) => {
                const title = conversation?.title || conversation?.name || "Member";
                return (
                <Link key={conversation.id} href={`/chat/${conversation.id}`} className={styles.item} onClick={() => setOpen(false)}>
                  <span className={styles.avatar}>{title.slice(0, 1).toUpperCase()}</span>
                  <span className={styles.itemBody}>
                    <span className={styles.itemTop}>
                      <strong>{title}</strong>
                      <time dateTime={conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toISOString() : undefined}>{timeLabel(conversation.lastMessageAt)}</time>
                    </span>
                    <span className={styles.preview}>{conversation.lastMessage || "Say hello!"}</span>
                  </span>
                </Link>
                );
              })}
            </div>
          )}
          <Link href="/chat" className={styles.viewAll} onClick={() => setOpen(false)}>View all chats</Link>
        </section>
      )}
    </div>
  );
}