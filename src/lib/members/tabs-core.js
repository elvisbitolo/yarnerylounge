// The member directory's tab strip.
//
// "All", "In the lounge", "Online today" and "Hosts" have always been
// predicates — they narrow the pool. "Newest" and "Top" were not: they only
// re-sorted it. The directory renders a scatter and composeLayout() has no cap,
// so re-sorting still drew every avatar, and both tabs read as "All".
//
// They narrow now, and each is a single control doing one job: narrow, and
// report honestly if the view was truncated.

const DAY_MS = 24 * 60 * 60 * 1000;

export const MEMBER_TABS = [
  { key: "all", label: "All" },
  { key: "lounge", label: "In the lounge" },
  { key: "online", label: "Online today" },
  { key: "newest", label: "Newest" },
  { key: "top", label: "Top" },
  { key: "hosts", label: "Hosts" },
];

// How far back "Newest" reaches. A fortnight of joiners is the useful window:
// long enough to have a populated view, short enough that everyone in it really
// is new. The full membership stays reachable through All.
export const NEWEST_WINDOW_DAYS = 14;

// Matches the leaderboard the sidebar already renders, so "Top" here and the
// leaderboard there cannot drift apart into two different top-30s.
export const TOP_LIMIT = 30;

// recordDailyVisit() pays DAILY_VISIT (10) on a member's first visit, so
// essentially every member who has ever logged in has points > 0. Scoring the
// cut at 0 would put every member back in the view and reintroduce the bug.
export const TOP_MIN_POINTS = 1;

// Members with no recorded join date have createdAt === 0. They are not new,
// so a date we never captured must not read as "joined just now".
function isWithinNewestWindow(member, since) {
  return (member.createdAt || 0) > since;
}

function isHost(member) {
  return member.role === "owner" || member.role === "moderator" || member.role === "host";
}

const byCreatedAtDesc = (a, b) => (b.createdAt || 0) - (a.createdAt || 0);
const byPointsDesc = (a, b) => (b.points || 0) - (a.points || 0);
const byNameAsc = (a, b) => String(a.name || "").localeCompare(String(b.name || ""));

// Does this member belong in `tab`? `all` matches everyone.
//
// `todayKey` is supplied by the caller because the server already computed it
// for the "Online today" tab; deriving it here would risk a second, differently
// clocked copy of "today".
export function matchesMemberTab(member, tab, { nowMs, todayKey } = {}) {
  switch (tab) {
    case "lounge":
      return Boolean(member.live);
    case "online":
      return (member.lastVisitDate || "") === todayKey;
    case "hosts":
      return isHost(member);
    case "newest":
      return isWithinNewestWindow(member, (nowMs || Date.now()) - NEWEST_WINDOW_DAYS * DAY_MS);
    case "top":
      return (member.points || 0) >= TOP_MIN_POINTS;
    default:
      return true;
  }
}

// What the empty state says.
//
// "Nobody is in the lounge" and "we could not check who is in the lounge" are
// different facts. listActiveRoomMemberIds() used to return a bare [] on a
// failed query, so a presence blip rendered as an empty lounge and the member
// was told the room was deserted. It now reports whether it could answer, and
// this is where that distinction reaches the screen.
export function emptyViewMessage({
  tab,
  query = "",
  activeFilterCount = 0,
  presenceAvailable = true,
} = {}) {
  if (tab === "lounge" && !presenceAvailable) {
    return "We couldn't check who is in the lounge just now. Try again in a moment.";
  }
  if (tab === "lounge") return "Nobody is in the lounge right now.";
  if (query || tab !== "all" || activeFilterCount > 0) return "No members match this view.";
  return "No members yet.";
}

// Narrow `pool` to `tab` and order it for display.
//
// Returns `total` — how many members matched before any cap — alongside the
// visible `list`, so the caller can say "showing 30 of 214" rather than
// silently implying the view is complete. `capped` reports whether that
// happened; a capped view that does not say so is the same class of bug as a
// failed query rendered as an empty one.
export function applyMemberTab(pool, tab, opts = {}) {
  const { nowMs = Date.now(), todayKey = "", topLimit = TOP_LIMIT } = opts;
  const members = Array.isArray(pool) ? pool : [];
  const matched = members.filter((member) => matchesMemberTab(member, tab, { nowMs, todayKey }));

  switch (tab) {
    case "newest": {
      matched.sort(byCreatedAtDesc);
      return { list: matched, total: matched.length, capped: false };
    }
    case "top": {
      matched.sort(byPointsDesc);
      return {
        list: matched.slice(0, topLimit),
        total: matched.length,
        capped: matched.length > topLimit,
      };
    }
    case "lounge":
    case "online":
    case "hosts": {
      // No cap: these tabs are already narrow, and the lounge/online sets are
      // small and live. Order by name so the scatter is stable between loads.
      const sorted = [...matched].sort(byNameAsc);
      return { list: sorted, total: sorted.length, capped: false };
    }
    default: {
      const sorted = [...matched].sort(byNameAsc);
      return { list: sorted, total: sorted.length, capped: false };
    }
  }
}
