"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, Search, X } from "lucide-react";
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

  useEffect(() => {
    let active = true;
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
    load();
    const timer = setInterval(load, 20_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!panelRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const visible = filter === "unread"
    ? summary.conversations.filter((conversation) => conversation.lastMessageAt > (conversation.lastReadAt || 0))
    : summary.conversations;

  return (
    <div className={styles.wrap} ref={panelRef}>
      <button
        type="button"
        className={styles.button}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={summary.unread ? `Chat, ${summary.unread} unread` : "Chat"}
        title="Chat"
      >
        <MessageCircle size={19} />
        {summary.unread > 0 && <span className={styles.badge}>{summary.unread > 99 ? "99+" : summary.unread}</span>}
      </button>

      {open && (
        <section className={styles.panel} aria-label="Chat inbox">
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
            <button type="button" className={filter === "all" ? styles.filterActive : styles.filter} onClick={() => setFilter("all")}>All</button>
            <button type="button" className={filter === "unread" ? styles.filterActive : styles.filter} onClick={() => setFilter("unread")}>Unread{summary.unread > 0 ? ` · ${summary.unread}` : ""}</button>
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
                      <time>{timeLabel(conversation.lastMessageAt)}</time>
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
