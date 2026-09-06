"use client";

import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";

function readLocale() {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/NEXT_LOCALE=(\w+)/);
  return match ? match[1] : "";
}

export default function Providers({ messages, locale: serverLocale, children }) {
  const [locale, setLocale] = useState(() => readLocale() || serverLocale || "en");

  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale] || messages.en}>
      {children}
    </NextIntlClientProvider>
  );
}
