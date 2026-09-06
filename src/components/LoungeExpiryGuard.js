"use client";

import { useEffect, useRef } from "react";

// Global mount-time plan gate (client). On every mount it asks /api/me for the
// signed-in user's plan + expiresAt and, when a paid plan has lapsed, hard-
// redirects to the renewal screen. Server-side pages also guard individually
// via loungeGate(); this covers every route including client-only ones.
export default function LoungeExpiryGuard() {
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (!res.ok) return;
        const me = await res.json();
        if (cancelled || !me) return;
        if (me.isExpired && me.plan !== "flirting" && me.role !== "owner" && me.role !== "moderator") {
          // Full reload so the renewal page renders server-side.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- hard redirect to renewal
          window.location.assign("/plan-expired");
        }
      } catch {
        // Leave untouched on network errors — server pages still gate.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}