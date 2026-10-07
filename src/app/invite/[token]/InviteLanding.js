"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "../invite.module.css";

const STORAGE_KEY = "sy:join:invite";

// Handles the two states of an invite link:
//   signed-out — saves the token so the post-signup claimer on the dashboard
//     can silently connect the account, then points the visitor at signup.
//   signed-in  — an explicit "Accept the invite" action (auto-claiming on a
//     mere visit would attribute a person who was just looking).
export default function InviteLanding({ token, hasSession, initial }) {
  const [state, setState] = useState(() => {
    if (!initial) return "missing";
    if (initial.expired) return "expired";
    if (initial.status === "pending") return "ready";
    return "closed";
  });
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState("");

  useEffect(() => {
    if (hasSession) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, token);
    } catch {
      // storage unavailable — the visitor simply reuses the link after signing up
    }
  }, [hasSession, token]);

  async function acceptInvite() {
    if (claiming) return;
    setClaiming(true);
    setClaimError("");
    try {
      const res = await fetch(`/api/invites/${token}/claim`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setClaimError(data.error || "Could not accept this invite.");
        return;
      }
      setState("claimed");
    } catch {
      setClaimError("Could not reach the server. Please try again.");
    } finally {
      setClaiming(false);
    }
  }

  const invitedBy = initial?.inviter?.name || "a community member";
  const avatar = initial?.inviter?.photoURL || "";
  const recipientName = initial?.recipientName || "";
  const message = initial?.message || "";

  const resultTitle =
    state === "expired"
      ? "This invite has expired"
      : "This invite is no longer available";
  const resultText =
    state === "expired"
      ? "Invites are good for a week from when they were sent."
      : "The member may have revoked it, or it was already accepted.";

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <p className={styles.brand}>
          <span className={styles.brandWord}>Secret Yarnery</span>
        </p>

        {state === "missing" && (
          <div className={styles.body}>
            <h1 className={styles.title}>This invite doesn&apos;t exist</h1>
            <p className={styles.blurb}>
              The link may be mistyped. Ask the member who shared it to send it again.
            </p>
            <Link className={styles.primaryBtn} href="/">
              Go to Secret Yarnery
            </Link>
          </div>
        )}

        {(state === "expired" || state === "closed") && (
          <div className={styles.body}>
            <h1 className={styles.title}>{resultTitle}</h1>
            <p className={styles.blurb}>{resultText}</p>
            <Link className={styles.primaryBtn} href="/">
              Go to Secret Yarnery
            </Link>
          </div>
        )}

        {state === "ready" && (
          <div className={styles.body}>
            <div className={styles.inviter}>
              {avatar ? (
                <img className={styles.avatarImg} src={avatar} alt="" />
              ) : (
                <span className={styles.avatarFallback}>
                  {(invitedBy.charAt(0) || "?").toUpperCase()}
                </span>
              )}
            </div>
            <h1 className={styles.title}>You&apos;re invited</h1>
            <p className={styles.byline}>
              {invitedBy} would love to have you in Secret Yarnery — a cozy online home for
              crafters and makers-in-the-making.
            </p>
            {recipientName && <p className={styles.noteGreeting}>Hey {recipientName}.</p>}
            {message && <p className={styles.note}>{message}</p>}

            {hasSession ? (
              <div className={styles.actions}>
                <button className={styles.primaryBtn} onClick={acceptInvite} disabled={claiming}>
                  {claiming ? "Accepting…" : "Accept this invite"}
                </button>
                {claimError && <p className={styles.errorText}>{claimError}</p>}
              </div>
            ) : (
              <div className={styles.actions}>
                <Link className={styles.primaryBtn} href="/signup">
                  Create your free account
                </Link>
                <span className={styles.or}>or</span>
                <Link className={styles.secondaryBtn} href="/login">
                  I already have an account
                </Link>
                <p className={styles.hint}>
                  We&apos;ll connect you to {invitedBy}&apos;s invite automatically after you sign in.
                </p>
              </div>
            )}
          </div>
        )}

        {state === "claimed" && (
          <div className={styles.body}>
            <h1 className={styles.title}>You&apos;re in — welcome!</h1>
            <p className={styles.blurb}>
              You&apos;ve accepted {invitedBy}&apos;s invitation to Secret Yarnery.
            </p>
            <Link className={styles.primaryBtn} href="/explore">
              Start exploring
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}