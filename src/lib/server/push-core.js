// Pure helpers for web-push payloads. Kept separate from push.js so the shaping
// logic is unit-testable without a DB, a VAPID config or the web-push runtime.

export const DEFAULT_PUSH_TITLE = "Secret Yarnery";

// Build the { title, body, url } the service worker (public/sw.js) expects.
// The actor's name becomes the title so the notification reads as a person
// ("Ada" / "sent you a message"); system notifications fall back to the brand.
// The URL is restricted to same-origin paths so a push can never be used to
// navigate a member off-site.
export function buildPushPayload({ actorName, text, href } = {}) {
  const name = typeof actorName === "string" ? actorName.trim() : "";
  const body = typeof text === "string" ? text.trim() : "";
  const url = typeof href === "string" && href.startsWith("/") ? href : "/";
  return { title: name || DEFAULT_PUSH_TITLE, body, url };
}
