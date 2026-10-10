// Client-side helpers for the community feed (composer triggers, media embeds,
// tag normalization). Kept dependency-free and pure so they run in Node tests.

// Detects the token under the cursor in a composer textarea. Returns the token
// the user is typing ("@name" or "#tag") or null when there is none.
export function detectTrigger(text, cursorPos) {
  if (typeof text !== "string" || typeof cursorPos !== "number") return null;
  const before = text.slice(0, cursorPos);
  const at = before.match(/@([a-zA-Z0-9_]{0,30})$/);
  if (at) return { type: "mention", start: at.index + 1, query: at[1] };
  const hash = before.match(/#([a-zA-Z0-9_]{0,30})$/);
  if (hash) return { type: "tag", start: hash.index + 1, query: hash[1] };
  return null;
}

export function normalizeTag(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/^#/, "").toLowerCase();
}

export function isValidTag(tag) {
  return typeof tag === "string" && /^[a-zA-Z0-9_]{1,50}$/.test(tag);
}

// Classifies a pasted URL so the feed can render a native player (YouTube /
// Vimeo), a direct video file, or a plain link card.
export function embedInfoForUrl(url) {
  if (!url || typeof url !== "string") return { type: "none" };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { type: "link", url, host: "" };
  }
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const path = parsed.pathname || "";

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") {
    let id = "";
    if (host === "youtu.be") {
      id = path.split("/").filter(Boolean)[0] || "";
    } else {
      const v = new URLSearchParams(parsed.search).get("v");
      const short = (path.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{6,})/) || [])[1] || "";
      id = v || short;
    }
    if (id) return { type: "youtube", embedUrl: `https://www.youtube.com/embed/${id}`, url, host };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = path.match(/^\/(?:video\/)?(\d+)/);
    if (m) return { type: "vimeo", embedUrl: `https://player.vimeo.com/video/${m[1]}`, url, host };
  }

  if (/\.(mp4|webm|ogv|ogg|mov|m4v)(\?.*)?$/i.test(url)) {
    return { type: "video", url, host };
  }

  return { type: "link", url, host };
}