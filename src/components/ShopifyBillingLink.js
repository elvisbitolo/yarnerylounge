"use client";

import { useEffect, useState } from "react";

export default function ShopifyBillingLink({
  className = "",
  wrapperClassName = "",
  message = "Link your Shopify billing once to cancel everything here.",
}) {
  const [linked, setLinked] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/shopify/status", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (alive) setLinked(Boolean(data?.linked));
      })
      .catch(() => {
        if (alive) setLinked(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (linked !== false) return null;

  return (
    <p className={wrapperClassName}>
      {message}{" "}
      <a className={className} href="/api/auth/shopify/link">
        Link Shopify billing once →
      </a>
    </p>
  );
}
