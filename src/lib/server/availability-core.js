export const AVAILABILITY_MAX_TITLE = 60;
export const AVAILABILITY_MAX_NOTE = 300;
export const AVAILABILITY_MAX_MINUTES = 24 * 60;
export const AVAILABILITY_MIN_MINUTES = 15;

export const CALENDAR_ROOMS = [
  { slug: "happy-hour-hub", name: "Happy Hour Hub", color: "#e91e63" },
  { slug: "lo-fi-and-loops", name: "Lo-Fi & Loops", color: "#2dd4bf" },
  { slug: "velvet-den", name: "The Velvet Den", color: "#a78bfa" },
  { slug: "silent-studio", name: "The Silent Studio", color: "#94a3b8" },
];

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Repeat values: "none" (one-off), "weekly" (legacy: every week on the
// block's own weekday), or "weekly-<weekday>" with weekday 0=Sun…6=Sat.
export const RECURRING_OPTIONS = [
  { value: "none", label: "Once" },
  { value: "weekly-1", label: "Every Monday", weekday: 1 },
  { value: "weekly-2", label: "Every Tuesday", weekday: 2 },
  { value: "weekly-3", label: "Every Wednesday", weekday: 3 },
  { value: "weekly-4", label: "Every Thursday", weekday: 4 },
  { value: "weekly-5", label: "Every Friday", weekday: 5 },
  { value: "weekly-6", label: "Every Saturday", weekday: 6 },
  { value: "weekly-0", label: "Every Sunday", weekday: 0 },
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export function roomColorFor(slug) {
  return CALENDAR_ROOMS.find((r) => r.slug === slug)?.color || "#a78bfa";
}

export function roomNameFor(slug) {
  return CALENDAR_ROOMS.find((r) => r.slug === slug)?.name || slug || "Any lounge";
}

export function toIso(v) {
  if (!v) return null;
  if (typeof v.toMillis === "function") return new Date(v.toMillis()).toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") return new Date(v).toISOString();
  if (typeof v === "string") return v;
  return null;
}

export function normalizeRecurring(value) {
  if (value === "weekly") return "weekly";
  if (/^weekly-[0-6]$/.test(value || "")) return value;
  return "none";
}

// Numeric weekday for a weekly repeat, or null when it's not weekday-specific
// (one-off blocks and legacy "weekly" both fall back to the block's own day).
export function recurringWeekday(recurring) {
  if (recurring === "weekly") return null;
  const m = /^weekly-([0-6])$/.exec(recurring || "");
  return m ? Number(m[1]) : null;
}

export function recurringLabel(recurring) {
  const rec = normalizeRecurring(recurring);
  if (rec === "none") return "Once";
  const wd = recurringWeekday(rec);
  return wd == null ? "Every week" : `Every ${WEEKDAY_NAMES[wd]}`;
}

export function recurringShortLabel(recurring) {
  const rec = normalizeRecurring(recurring);
  if (rec === "none") return "Once";
  const wd = recurringWeekday(rec);
  return wd == null ? "Weekly" : WEEKDAY_NAMES[wd].slice(0, 3);
}

// First calendar-day on which this repeat turns up: the start date itself for
// one-off / legacy weekly, or the next matching weekday for a day-specific one.
export function weeklyFirstOccurrence(startAt, recurring) {
  const start = new Date(startAt);
  const wd = recurringWeekday(recurring);
  if (wd == null) return start;
  const shift = (wd - start.getDay() + 7) % 7;
  return new Date(start.getTime() + shift * DAY_MS);
}

export function serializeAvailability(docOrRow) {
  const data = typeof docOrRow?.data === "function" ? docOrRow.data() : docOrRow;
  const id = typeof docOrRow?.data === "function" ? docOrRow.id : docOrRow.id;
  return {
    id,
    userId: data.userId || "",
    userName: data.userName || "",
    userAvatar: data.userAvatar || "",
    title: data.title || "",
    note: data.note || "",
    roomSlug: data.roomSlug || "",
    roomName: roomNameFor(data.roomSlug),
    color: data.color || roomColorFor(data.roomSlug),
    startAt: toIso(data.startAt),
    endAt: toIso(data.endAt),
    recurring: normalizeRecurring(data.recurring),
    rsvpCount: data.rsvpCount || 0,
    createdAt: toIso(data.createdAt),
  };
}

export function nextOccurrenceAt(slot, now = new Date()) {
  const start = new Date(slot.startAt);
  if (!Number.isFinite(start.getTime())) return null;
  if (normalizeRecurring(slot.recurring) === "none") {
    return start.getTime() >= now.getTime() ? start.toISOString() : null;
  }
  const first = weeklyFirstOccurrence(start, slot.recurring);
  if (first.getTime() >= now.getTime()) return first.toISOString();
  const k = Math.ceil((now.getTime() - first.getTime()) / WEEK_MS);
  return new Date(first.getTime() + k * WEEK_MS).toISOString();
}

// Values that mean "this block happens only once". NULL appears because older
// rows predate the column default and store nothing at all.
const ONE_OFF_RECURRING = [null, "none"];

// A recurring row's startAt/endAt hold only the FIRST occurrence; the block
// then repeats weekly forever. Bounding such a row by a window's lower bound
// would drop it permanently the moment that first occurrence passed, so the
// query has to treat one-off and recurring rows differently. One-offs are
// windowed directly; recurring rows are kept as long as their anchor begins
// before the window closes, and the per-day match decides what renders.
export function availabilityWindowWhere({ from, to } = {}) {
  if (!from && !to) return {};
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (fromDate && !Number.isFinite(fromDate.getTime())) return {};
  if (toDate && !Number.isFinite(toDate.getTime())) return {};

  // `in` cannot carry a null in Prisma, so a missing value needs its own
  // clause; older rows predate the default and store recurring as NULL.
  const oneOff = { OR: ONE_OFF_RECURRING.map((value) => ({ recurring: value })) };
  if (fromDate) oneOff.startAt = { gte: fromDate };
  if (toDate) oneOff.endAt = { lte: toDate };

  const recurring = { recurring: { startsWith: "weekly" } };
  if (toDate) recurring.startAt = { lte: toDate };

  return { OR: [oneOff, recurring] };
}

// Whether a recurring block appears on a given calendar day (for grid views).
export function recurringDayMatches(block, day) {
  const rec = normalizeRecurring(block?.recurring);
  if (rec === "none") return false;
  const start = new Date(block.startAt);
  const dayStart = startOfDay(day);
  if (dayStart < startOfDay(start)) return false;
  const wd = recurringWeekday(rec);
  const anchor = weeklyFirstOccurrence(start, rec);
  return wd == null
    ? dayStart.getDay() === start.getDay() && dayStart >= startOfDay(start)
    : dayStart.getDay() === wd && dayStart >= startOfDay(anchor);
}