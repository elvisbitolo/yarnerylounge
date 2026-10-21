// One rule for "this event may be shown on a public surface", shared by the
// unauthenticated landing-page feed (/api/public/events) and the public
// Explore page.
//
// The public feed used to ask for nothing but `membersOnly: false`, so it
// published every event in the database to anyone who opened the marketing
// page:
//   - events nobody opted into previewing (`publicPreview` is false or NULL),
//     including meetups promoted from a member's availability block, whose
//     title and note are that member's own words;
//   - events inside a space that is invite only, or that has been deleted.
//
// `Event.publicPreview` is the explicit "this may be shown publicly" opt-in
// that the admin event manager toggles ("On explore") and that every other
// public surface already honours (explore.js, the discovery route, search).
// The space an event lives in has to be publicly visible as well: a space
// that is not previewing publicly, is invite only, or is deleted keeps its
// events off the public feed.
//
// Space.access and Space.status are nullable, and Prisma's `{ not: "invite" }`
// compiles to SQL that drops NULL rows ("access <> 'invite'" is UNKNOWN for a
// NULL column, and a WHERE clause keeps only TRUE). The rest of the codebase
// reads a NULL access as "public" and a NULL status as "active" (see
// mapSpaceRow in spaces-core.js and mapRoomRow in rooms-core.js), so the rule
// matches the null state explicitly rather than dropping those spaces.

// A space may hold public events only while it is publicly visible itself.
export const PUBLIC_SPACE_WHERE = {
  AND: [
    { publicPreview: true },
    { OR: [{ access: null }, { access: { not: "invite" } }] },
    { OR: [{ status: null }, { status: { not: "deleted" } }] },
  ],
};

// The public visibility rule for an event.
export const PUBLIC_EVENT_WHERE = {
  AND: [
    { publicPreview: true },
    { membersOnly: false },
    {
      OR: [
        // An event that does not belong to a space is judged on its own.
        { spaceId: null },
        { space: { is: PUBLIC_SPACE_WHERE } },
      ],
    },
  ],
};

// Combine the public rule with other conditions. Prisma ANDs a top-level `OR`
// with its sibling keys, so the extra conditions have to ride along inside
// the same AND rather than beside it.
export function publicEventWhere(conditions) {
  return { AND: [PUBLIC_EVENT_WHERE, conditions] };
}

// The lean shape the public feed returns. Keep it small: the response is
// cached at the CDN and fetched straight from a visitor's browser.
export const PUBLIC_EVENT_SELECT = {
  id: true,
  title: true,
  description: true,
  startTime: true,
  endTime: true,
  roomSlug: true,
  recurrence: true,
  room: { select: { publicPreview: true, status: true } },
};

// A room may be named on a public surface only while it is previewing
// publicly and still active. A lounge that is not previewing publicly stays
// unnamed on the marketing page.
export function isPublicRoom(room) {
  if (!room) return false;
  if (room.publicPreview !== true) return false;
  return (room.status || "active") === "active";
}

// The public projection of one event.
export function toPublicEvent(event) {
  return {
    id: event.id,
    title: event.title || "Speakeasy event",
    description: (event.description || "").slice(0, 160),
    startTime: new Date(event.startTime).toISOString(),
    endTime: event.endTime ? new Date(event.endTime).toISOString() : null,
    roomSlug: isPublicRoom(event.room) ? event.roomSlug || "" : "",
  };
}

// One entry per event, at its next occurrence. A recurring event expands into
// many occurrences that all carry the base event id, so listing them as-is
// filled the public feed with copies of the same meetup (one weekly event
// could take every slot) and handed React duplicate keys.
export function nextOccurrences(events) {
  const sorted = [...events].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
  const seen = new Set();
  const out = [];
  for (const event of sorted) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    out.push(event);
  }
  return out;
}

// Whether an event row carries a recurrence rule.
export function hasRecurrence(event) {
  const recurrence = event && event.recurrence;
  return !!recurrence && typeof recurrence === "object" && !!recurrence.freq;
}

// Whether an occurrence still lies ahead of us.
export function isUpcoming(event, now = Date.now()) {
  return new Date(event.startTime).getTime() >= now;
}

// `Number(null)` is 0, so a missing limit parameter used to fall through to
// the clamp floor of 1 instead of the documented default of 6.
export function parsePublicLimit(raw, fallback = 6, max = 12) {
  if (raw === null || raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
}
