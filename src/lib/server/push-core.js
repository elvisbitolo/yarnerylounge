// Pure helpers for web-push payloads. Kept separate from push.js so the shaping
// logic is unit-testable without a DB, a VAPID config or the web-push runtime.

export const DEFAULT_PUSH_TITLE = "Secret Yarnery";

function internalPath(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return "/";
  }

  try {
    const parsed = new URL(value, "https://push.invalid");
    return parsed.origin === "https://push.invalid"
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : "/";
  } catch {
    return "/";
  }
}

// Build the { title, body, url } the service worker (public/sw.js) expects.
// The actor's name becomes the title so the notification reads as a person
// ("Ada" / "sent you a message"); system notifications fall back to the brand.
// Notification destinations are normalised to same-origin paths only.
export function buildPushPayload({ actorName, text, href } = {}) {
  const name = typeof actorName === "string" ? actorName.trim() : "";
  const body = typeof text === "string" ? text.trim() : "";
  return { title: name || DEFAULT_PUSH_TITLE, body, url: internalPath(href) };
}

// Serialise the push body the service worker reads. `badge` is the member's
// unread count at delivery time: sw.js forwards it to the app-icon badge.
// Anything non-numeric, negative or absurd collapses to 0.
export function pushMessageJson({ title, body = "", url = "/", badge = 0 } = {}) {
  const parsed = Number(badge);
  const count =
    Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.trunc(parsed), 9999) : 0;
  return JSON.stringify({
    title: title || DEFAULT_PUSH_TITLE,
    body: body || "",
    url: internalPath(url),
    badge: count,
  });
}
