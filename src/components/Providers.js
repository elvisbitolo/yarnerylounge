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
    const heartbeat = () => fetch("/api/presence", { method: "POST", keepalive: true }).catch(() => {});
    heartbeat();
    const timer = setInterval(heartbeat, 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale] || messages.en} timeZone="UTC">
      <MembershipProvider>{children}</MembershipProvider>
    </NextIntlClientProvider>
  );
}
