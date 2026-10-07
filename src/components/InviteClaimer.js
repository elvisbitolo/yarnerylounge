"use client";

import { useEffect } from "react";

const STORAGE_KEY = "sy:join:invite";

// Drains the invite token the /invite/[token] landing page stores for someone
// who is not signed in yet. Runs on every authed page (Nav mounts everywhere),
// so the moment a new member surfaces after signup — wherever they land — their
// referral is claimed silently and the inviter gets notified. Quiet by design:
// the member finds themselves logged in, and that is the message.
export default function InviteClaimer() {
  useEffect(() => {
    let token;
    try {
      token = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (!token) return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      return;
    }
    fetch(`/api/invites/${encodeURIComponent(token)}/claim`, { method: "POST" }).catch(() => {});
  }, []);
  return null;
}