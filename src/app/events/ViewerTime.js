"use client";

import { useSyncExternalStore } from "react";

// Renders a timestamp in the *viewer's* zone, on purpose.
//
// The server cannot know where a member is: an "11:00" block belongs to whoever
// is reading it, so a Nairobi member and a New York member must see different
// clock times for the same instant. Server-side toLocaleString() silently uses
// the host's zone (UTC on Vercel), which is what made an 11:00 block display as
// 2:00 PM.
//
// The zone is read during render via useSyncExternalStore instead of an effect:
// it is a per-viewer runtime fact that never changes while the page is open, so
// there is no subscription to manage. That also avoids rendering a server-guessed
// time that would flash the wrong value and then correct itself.

const OPTIONS = {
  long: {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
  short: { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
};

function subscribe() {
  return () => {};
}

function viewerZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export default function ViewerTime({ iso, variant = "long", withZone = false }) {
  const zone = useSyncExternalStore(subscribe, viewerZone, () => "UTC");

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  // An unknown or unsupported zone must not blank out the time, so fall back to
  // the runtime default instead of leaving the slot empty.
  let text;
  try {
    const opts = withZone ? { ...OPTIONS[variant], timeZone: zone } : OPTIONS[variant];
    text = date.toLocaleString([], opts);
  } catch {
    text = date.toLocaleString([], OPTIONS[variant]);
  }
  return <>{text}</>;
}
