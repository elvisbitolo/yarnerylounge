"use client";

import { NextIntlClientProvider } from "next-intl";
import { useEffect, useState } from "react";
import { MembershipProvider } from "@/lib/membership";

function readLocale() {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/NEXT_LOCALE=(\w+)/);
  return match ? match[1] : "";
}

export default function Providers({ messages, locale: serverLocale, children }) {
  const [locale, setLocale] = useState(() => readLocale() || serverLocale || "en");

  useEffect(() => {
    // Emergency recovery: visit any page with ?clear-sw=true to unregister
    // this origin's Service Workers and clear their Cache Storage. Remove the
    // flag before the one clean navigation so it cannot run repeatedly.
    const recoveryUrl = new URL(window.location.href);
    if (recoveryUrl.searchParams.get("clear-sw") === "true") {
      recoveryUrl.searchParams.delete("clear-sw");
      const cleanUrl = `${recoveryUrl.pathname}${recoveryUrl.search}${recoveryUrl.hash}`;
      (async () => {
        try {
          if ("serviceWorker" in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map((registration) => registration.unregister()));
          }
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((key) => caches.delete(key)));
          }
        } finally {
          window.location.replace(cleanUrl);
        }
      })();
      return;
    }

    let cancelled = false;
    let timer;
    (async () => {
      // Only signed-in sessions send presence heartbeats. Firing /api/presence
      // on anonymous auth pages (login, signup, signing-in) just produces 401s
      // in the logs and has no effect on the online indicator.
      try {
        const me = await fetch("/api/me", { cache: "no-store" });
        if (!me.ok) return;
        const data = await me.json().catch(() => null);
        if (!data?.uid) return;
      } catch {
        return;
      }
      if (cancelled) return;
      const heartbeat = () => fetch("/api/presence", { method: "POST", keepalive: true }).catch(() => {});
      heartbeat();
      timer = setInterval(heartbeat, 30_000);
    })();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale] || messages} timeZone="UTC">
      <MembershipProvider>{children}</MembershipProvider>
    </NextIntlClientProvider>
  );
}
