"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./WhatsAppInbox.module.css";

function formatTime(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return "";
  }
}

export default function WhatsAppInbox() {
  const [contacts, setContacts] = useState([]);
  const [selectedPhone, setSelectedPhone] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/whatsapp-inbox", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Could not load WhatsApp messages.");
      const items = Array.isArray(json.contacts) ? json.contacts : [];
      setContacts(items);
      setSelectedPhone((current) => current && items.some((item) => item.phone === current)
        ? current
        : (items[0]?.phone || current));
    } catch (err) {
      setError(err?.message || "Could not load WhatsApp messages.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const refreshTimer = setInterval(load, 15000);
    return () => clearInterval(refreshTimer);
  }, [load]);

  const selected = useMemo(
    () => contacts.find((item) => item.phone === selectedPhone) || null,
    [contacts, selectedPhone]
  );
  const messages = useMemo(
    () => [...(selected?.messages || [])].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    [selected]
  );

  async function startConversation(event) {
    event.preventDefault();
    const value = phoneDraft.trim().replace(/[\s().-]/g, "");
    if (!value) return;
    setError("");
    setNotice("");
    setSelectedPhone(value.startsWith("+") ? value : `+${value}`);
    setPhoneDraft("");
  }

  async function send(event) {
    event.preventDefault();
    if (!selectedPhone || !message.trim() || sending) return;
    setSending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/whatsapp-inbox", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: selectedPhone, text: message.trim() }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Message could not be sent.");
      setMessage("");
      setNotice("Message accepted by WhatsApp. Delivery status will update when Meta sends a receipt.");
      await load();
      setSelectedPhone(selectedPhone);
    } catch (err) {
      setError(err?.message || "Message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>MESSAGING</p>
          <h1>WhatsApp inbox</h1>
          <p className={styles.subtitle}>Incoming messages, delivery receipts, and replies from one place.</p>
        </div>
        <button type="button" className={styles.refresh} onClick={load} disabled={loading}>Refresh</button>
      </header>

      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      {notice ? <div className={styles.notice} role="status">{notice}</div> : null}

      <form className={styles.newContact} onSubmit={startConversation}>
        <label htmlFor="whatsapp-new-phone">Message a number</label>
        <input
          id="whatsapp-new-phone"
          value={phoneDraft}
          onChange={(event) => setPhoneDraft(event.target.value)}
          placeholder="+2547XXXXXXXX"
          inputMode="tel"
          autoComplete="tel"
        />
        <button type="submit">Open chat</button>
      </form>

      <section className={styles.workspace} aria-label="WhatsApp conversations">
        <aside className={styles.contacts}>
          <div className={styles.sectionTitle}>Conversations <span>{contacts.length}</span></div>
          {loading ? <p className={styles.empty}>Loading messages…</p> : null}
          {!loading && contacts.length === 0 ? <p className={styles.empty}>No WhatsApp messages yet. Incoming messages will appear here.</p> : null}
          {contacts.map((contact) => (
            <button
              type="button"
              key={contact.phone}
              className={contact.phone === selectedPhone ? styles.contactActive : styles.contact}
              onClick={() => { setSelectedPhone(contact.phone); setError(""); setNotice(""); }}
            >
              <span className={styles.avatar}>{(contact.name || contact.phone).slice(0, 1).toUpperCase()}</span>
              <span className={styles.contactCopy}>
                <span className={styles.contactName}>{contact.name || contact.phone}</span>
                <span className={styles.contactPreview}>{contact.lastMessage || "No messages"}</span>
                <span className={styles.contactMeta}>{contact.phone} · {formatTime(contact.lastMessageAt)}</span>
              </span>
            </button>
          ))}
        </aside>

        <section className={styles.thread}>
          {selectedPhone ? (
            <>
              <header className={styles.threadHeader}>
                <div className={styles.avatar}>{(selected?.name || selectedPhone).slice(0, 1).toUpperCase()}</div>
                <div>
                  <h2>{selected?.name || selectedPhone}</h2>
                  <p>{selectedPhone}{selected?.userId ? " · Linked member" : ""}</p>
                </div>
              </header>
              <div className={styles.messageList}>
                {messages.length === 0 ? <p className={styles.empty}>No messages loaded for this number yet. Send a message to start the conversation.</p> : null}
                {messages.map((item) => (
                  <article key={item.id} className={item.direction === "outbound" ? styles.outbound : styles.inbound}>
                    <p>{item.text}</p>
                    <footer>{formatTime(item.createdAt)}{item.direction === "outbound" ? ` · ${item.status}` : " · received"}</footer>
                  </article>
                ))}
              </div>
              <form className={styles.composer} onSubmit={send}>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={4096}
                  rows={2}
                  placeholder="Write a WhatsApp message…"
                  aria-label="WhatsApp message"
                />
                <button type="submit" disabled={sending || !message.trim()}>{sending ? "Sending…" : "Send"}</button>
                <small>Free-form replies require an open WhatsApp customer-service window (usually 24 hours after their last message).</small>
              </form>
            </>
          ) : (
            <div className={styles.noSelection}>Select a conversation or enter a number to start one.</div>
          )}
        </section>
      </section>
    </main>
  );
}
