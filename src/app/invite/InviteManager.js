"use client";

import { useEffect, useState } from "react";
import styles from "./invite.module.css";

const RECIPIENT_NAME_MAX = 60;
const MESSAGE_MAX = 280;
const RECIPIENT_EMAIL_MAX = 254;

function formatWhen(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fullUrl(link) {
  try {
    return window.location.origin + link;
  } catch {
    return link;
  }
}

function statusLabel(invite) {
  if (invite.status === "accepted") return "accepted";
  if (invite.status === "revoked") return "revoked";
  if (invite.expired) return "expired";
  return "pending";
}

export default function InviteManager() {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);
  const [formError, setFormError] = useState("");

  const [newInvite, setNewInvite] = useState(null);
  const [newInviteEmail, setNewInviteEmail] = useState("");
  const [emailed, setEmailed] = useState(false);
  const [copied, setCopied] = useState("");
  const [revokingId, setRevokingId] = useState("");

  useEffect(() => {
    fetch("/api/invites")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load" + res.status))))
      .then((data) => setInvites(data.invites || []))
      .catch(() => setLoadError("Couldn't load your invites. Try again."))
      .finally(() => setLoading(false));
  }, []);

  async function generateInvite(e) {
    e.preventDefault();
    if (generating) return;
    setFormError("");
    setGenerating(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientName, recipientEmail, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || "Could not create your invite.");
        return;
      }
      setNewInvite(data.link);
      setNewInviteEmail(data.invite?.recipientEmail || "");
      setEmailed(Boolean(data.emailed));
      setInvites((prev) => [data.invite, ...prev]);
      setRecipientName("");
      setRecipientEmail("");
      setMessage("");
    } catch {
      setFormError("Could not reach the server. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function copyLink(link) {
    const url = fullUrl(link);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setCopied("");
    }
  }

  async function revoke(invite) {
    const { id, token } = invite;
    if (revokingId) return;
    setRevokingId(id);
    try {
      const res = await fetch(`/api/invites/${token}`, { method: "DELETE" });
      if (!res.ok) return;
      setInvites((prev) =>
        prev.map((inv) => (inv.id === id ? { ...inv, status: "revoked" } : inv))
      );
    } finally {
      setRevokingId("");
    }
  }

  return (
    <div className={styles.managerPage}>
      <header className={styles.managerHeader}>
        <h1 className={styles.managerTitle}>Invite a friend</h1>
        <p className={styles.managerSub}>
          Add their email and we&apos;ll send the link for them — or make a link to share by text
          or DM. When your invitee joins and publishes their first post, you both earn points.
          Invites last 7 days.
        </p>
      </header>

      <form className={styles.compose} onSubmit={generateInvite}>
        <label htmlFor="recipientName">Who are you inviting? (optional)</label>
        <input
          id="recipientName"
          className={styles.field}
          type="text"
          maxLength={RECIPIENT_NAME_MAX}
          placeholder="e.g. Sarah"
          value={recipientName}
          onChange={(e) => setRecipientName(e.target.value)}
        />
        <label htmlFor="recipientEmail">Their email — send the link for them (optional)</label>
        <input
          id="recipientEmail"
          className={styles.field}
          type="email"
          maxLength={RECIPIENT_EMAIL_MAX}
          autoComplete="email"
          placeholder="sarah@example.com"
          value={recipientEmail}
          onChange={(e) => setRecipientEmail(e.target.value)}
        />
        <label htmlFor="message">Add a personal note (optional)</label>
        <textarea
          id="message"
          className={styles.field}
          maxLength={MESSAGE_MAX}
          placeholder="Hey! I thought you'd love this — it's a cozy community for crafters…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <div className={styles.composeActions}>
          <button className={styles.compBtn} type="submit" disabled={generating}>
            {generating ? "Creating…" : "Create invite link"}
          </button>
          <span className={styles.hint}>
            {newInvite
              ? emailed
                ? `Sent to ${newInviteEmail}.`
                : "Link ready — copy and send it wherever you like."
              : "Leave the email blank to get a link you can share yourself."}
          </span>
        </div>
        {formError && <p className={styles.formError}>{formError}</p>}
      </form>

      {newInvite && (
        <div className={styles.newInvite}>
          {emailed ? (
            <p className={styles.newInviteSent}>
              Invite emailed to <strong>{newInviteEmail}</strong>. They&apos;ll get a personal link
              — and you can still share it yourself below.
            </p>
          ) : (
            <span className={styles.newInviteUrl}>{fullUrl(newInvite)}</span>
          )}
          <button className={styles.copyBtn} onClick={() => copyLink(newInvite)}>
            {copied === fullUrl(newInvite) ? "Copied" : "Copy link"}
          </button>
        </div>
      )}

      <section className={styles.list}>
        <h2 className={styles.listHeading}>Your invites</h2>
        {loading && <p className={styles.empty}>Loading…</p>}
        {!loading && loadError && <p className={styles.empty}>{loadError}</p>}
        {!loading && !loadError && invites.length === 0 && (
          <p className={styles.empty}>
            You haven&apos;t sent any invites yet. Create your first link above.
          </p>
        )}
        {!loading &&
          invites.map((inv) => {
            const label = statusLabel(inv);
            return (
              <article className={styles.inviteCard} key={inv.id}>
                <div>
                  <div className={styles.inviteTop}>
                    <span className={inv.recipientName ? styles.inviteName : styles.inviteNameEmpty}>
                      {inv.recipientName || "Unnamed invite"}
                    </span>
                    <span className={`${styles.chip} ${styles[`chip${label.charAt(0).toUpperCase()}${label.slice(1)}`] || ""}`}>
                      {label}
                    </span>
                  </div>
                  {inv.message && <p className={styles.inviteMsg}>{inv.message}</p>}
                  <p className={styles.inviteMeta}>
                    Sent {formatWhen(inv.createdAt)}
                    {inv.recipientEmail ? ` · to ${inv.recipientEmail}` : ""}
                    {inv.status === "pending" && !inv.expired && ` · expires ${formatWhen(inv.expiresAt)}`}
                    {inv.status === "accepted" && inv.acceptedAt && ` · claimed ${formatWhen(inv.acceptedAt)}`}
                    {inv.activatedAt && ` · first post ${formatWhen(inv.activatedAt)}`}
                  </p>
                </div>
                {inv.status === "pending" && !inv.expired && (
                  <div className={styles.inviteLinks}>
                    <button className={styles.linkAction} onClick={() => copyLink(`/invite/${inv.token}`)}>
                      {copied === fullUrl(`/invite/${inv.token}`) ? "Copied" : "Copy link"}
                    </button>
                    <button
                      className={`${styles.linkAction} ${styles.linkDanger}`}
                      onClick={() => revoke(inv)}
                      disabled={Boolean(revokingId)}
                    >
                      {revokingId === inv.id ? "Revoking…" : "Revoke"}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
      </section>
    </div>
  );
}