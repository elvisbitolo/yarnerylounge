"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import { tierBadge } from "@/lib/server/plans";

const CACHE_PREFIX = "yarnery:membership:";

// Hardcoded fallback so the app never depends on the API for badges/locked UI.
// The tier badge is pulled from plans.js so the fallback matches the tier the
// server would resolve.
export const FREE_MEMBERSHIP = {
  planKey: "flirting",
  label: "Flirting",
  plan: "flirting",
  role: "member",
  capabilities: {
    video: { canJoin: true, canPublish: false, muted: true },
    chat: { read: true, write: false },
    matchmaker: false,
    hosting: false,
    neighborhoods: { join: false, build: false },
    profileBadge: tierBadge("flirting"),
  },
  profileBadge: tierBadge("flirting"),
  theme: null,
};

function cacheKey(uid) {
  return `${CACHE_PREFIX}${uid}`;
}

export function forgetCachedMembership(uid) {
  if (typeof window === "undefined" || !uid) return;
  try {
    window.sessionStorage.removeItem(cacheKey(uid));
  } catch {
    /* ignore */
  }
}

const MembershipContext = createContext(null);

export function MembershipProvider({ children }) {
  const [membership, setMembership] = useState(null);

  const load = useCallback(async (uid) => {
    try {
      const res = await fetch("/api/membership/me", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      // Never preserve a previously paid client-side tier when the server
      // cannot verify current entitlement. Server routes remain authoritative.
      if (auth.currentUser?.uid !== uid) return;
      setMembership(res.ok && data?.membership ? data.membership : FREE_MEMBERSHIP);
    } catch {
      if (auth.currentUser?.uid === uid) setMembership(FREE_MEMBERSHIP);
    }
  }, []);

  useEffect(() => {
    let uid = null;
    let loading = false;
    let active = true;

    const refresh = async () => {
      if (!active || !uid || loading || document.visibilityState === "hidden") return;
      loading = true;
      try {
        await load(uid);
      } finally {
        loading = false;
      }
    };

    const unsub = onAuthStateChanged(auth, (user) => {
      uid = user?.uid || null;
      setMembership(user ? FREE_MEMBERSHIP : null);
      if (uid) refresh();
    });

    // Installed PWAs often resume from the background without a full reload.
    // Revalidate entitlement on resume/focus and periodically while open.
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(refresh, 60_000);

    return () => {
      active = false;
      unsub();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(interval);
    };
  }, [load]);

  const refresh = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    forgetCachedMembership(user.uid);
    setMembership(FREE_MEMBERSHIP);
    await load(user.uid);
  }, [load]);

  return (
    <MembershipContext.Provider value={{ membership, refresh }}>
      {children}
    </MembershipContext.Provider>
  );
}

export function useMembership() {
  const ctx = useContext(MembershipContext);
  if (!ctx) return { membership: FREE_MEMBERSHIP, refresh: async () => {} };
  return ctx;
}