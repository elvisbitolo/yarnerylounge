"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { auth, onAuthStateChanged } from "@/lib/auth-client";

const CACHE_PREFIX = "yarnery:membership:";
const CACHE_TTL_MS = 10 * 60 * 1000;

// Hardcoded fallback so the app never depends on the API for badges/locked UI.
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
    profileBadge: null,
  },
  profileBadge: null,
  theme: null,
};

function cacheKey(uid) {
  return `${CACHE_PREFIX}${uid}`;
}

export function readCachedMembership(uid) {
  if (typeof window === "undefined" || !uid) return null;
  try {
    const raw = window.sessionStorage.getItem(cacheKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
    return parsed.membership || null;
  } catch {
    return null;
  }
}

export function forgetCachedMembership(uid) {
  if (typeof window === "undefined" || !uid) return;
  try {
    window.sessionStorage.removeItem(cacheKey(uid));
  } catch {
    /* ignore */
  }
}

function writeCache(uid, membership) {
  if (typeof window === "undefined" || !uid) return;
  try {
    window.sessionStorage.setItem(
      cacheKey(uid),
      JSON.stringify({ savedAt: Date.now(), membership })
    );
  } catch {
    /* quota — ignore */
  }
}

const MembershipContext = createContext(null);

export function MembershipProvider({ children }) {
  const [membership, setMembership] = useState(null);

  const load = useCallback(async (uid) => {
    const cached = readCachedMembership(uid);
    if (cached) setMembership(cached); // paint immediately from cache
    try {
      const res = await fetch("/api/membership/me", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (data?.ok && data.membership) {
        writeCache(uid, data.membership);
        setMembership(data.membership);
      } else if (!cached) {
        setMembership(FREE_MEMBERSHIP);
      }
    } catch {
      if (!cached) setMembership(FREE_MEMBERSHIP);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setMembership(null);
        return;
      }
      load(user.uid);
    });
    return unsub;
  }, [load]);

  const refresh = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    forgetCachedMembership(user.uid);
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