// Calendar geometry, shared by every view that puts an instant on a time axis.
//
// The bug this module exists to kill: the label and the grid position were
// computed independently. The label used toLocaleTimeString (which honours the
// viewer's clock) while the position used getHours() * 60 as a CSS `top` — i.e.
// it emitted *minutes* where the stylesheet expected *pixels*. On a 48px-per-hour
// grid that stretched every block 25% down the page, so a 12:00 event sat on the
// 15:00 row. The two must never be computed apart again, so there is one
// conversion here (minutesIntoDay) and both the label and the offset read it.
//
// All instants enter as UTC (Date or ISO string). A timeZone is always supplied
// explicitly in tests; callers pass the viewer's zone, defaulting to browser
// local. Nothing here reads the host clock.
export const MINUTES_PER_DAY = 1440;

// The time column renders one 48px row per hour. Keep these in step with
// .timeSlot / .dayBody in calendar.module.css.
export const GRID_PX_PER_HOUR = 48;
export const GRID_PX_PER_MINUTE = GRID_PX_PER_HOUR / 60;

// The week/day view opens on waking hours rather than a dead 00:00–08:00.
export const DEFAULT_WINDOW_START_MINUTES = 8 * 60;
export const DEFAULT_WINDOW_END_MINUTES = 19 * 60;

// Shortest block we will draw, so a zero-length slot stays tappable.
export const MIN_BLOCK_MINUTES = 30;

const ZONED_FORMATTERS = new Map();

function zonedFormatter(timeZone) {
  const key = timeZone || "__local__";
  let fmt = ZONED_FORMATTERS.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: timeZone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    ZONED_FORMATTERS.set(key, fmt);
  }
  return fmt;
}

function toDate(instant) {
  if (instant instanceof Date) return instant;
  return new Date(instant);
}

// The wall-clock fields an instant shows in a zone: { year, month, day, hour,
// minute, second }. Using Intl (rather than date.getHours()) is what lets a
// viewer in another region read the correct local time and keeps DST honest.
export function zonedParts(instant, timeZone) {
  const d = toDate(instant);
  if (Number.isNaN(d.getTime())) return null;
  const parts = {};
  for (const p of zonedFormatter(timeZone).formatToParts(d)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  // Some ICU builds emit "24" for midnight under h23; normalise it.
  const hour = Number(parts.hour) % 24;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

// Minutes since midnight in the given zone. This is the single source both the
// label and the grid offset are derived from.
export function minutesIntoDay(instant, timeZone) {
  const p = zonedParts(instant, timeZone);
  if (!p) return null;
  return p.hour * 60 + p.minute;
}

// YYYY-MM-DD for the day this instant falls on in the given zone. Replaces
// toISOString().slice(0,10), which is always UTC and so names the wrong day for
// anyone east of Greenwich in the small hours.
export function dayKeyFor(instant, timeZone) {
  const p = zonedParts(instant, timeZone);
  if (!p) return null;
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

// Wall-clock label for an instant. 24-hour by default (the PRD's Kenya default),
// hour12 opt-in. Same zone as minutesIntoDay, so label and position agree.
export function formatClock(instant, timeZone, { hour12 = false } = {}) {
  const d = toDate(instant);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timeZone || undefined,
    hour: hour12 ? "numeric" : "2-digit",
    minute: "2-digit",
    hourCycle: hour12 ? "h12" : "h23",
  }).format(d);
}

// Short date label for separators and headers. Pass e.g.
// { weekday: undefined, day: undefined } to drop a default field.
export function formatDay(instant, timeZone, options = {}) {
  const d = toDate(instant);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timeZone || undefined,
    weekday: "short",
    month: "short",
    day: "numeric",
    ...options,
  }).format(d);
}

// Where a block sits on the axis, and how tall it is, in pixels.
//
// top    = (block start, minutes past midnight) − window start, × px/min
// height = duration in minutes × px/min
//
// Duration is taken from the instant difference, not from subtracting two
// minute-into-day values, so a block that runs past midnight stays its true
// length instead of going negative.
export function blockGeometry({
  startAt,
  endAt,
  timeZone,
  windowStartMinutes = 0,
  pxPerMinute = GRID_PX_PER_MINUTE,
  minMinutes = MIN_BLOCK_MINUTES,
} = {}) {
  const start = toDate(startAt);
  const startMin = minutesIntoDay(start, timeZone);
  if (startMin == null) return null;

  const end = endAt == null ? null : toDate(endAt);
  const hasEnd = end && !Number.isNaN(end.getTime());
  const durationMin = hasEnd
    ? Math.max(minMinutes, (end.getTime() - start.getTime()) / 60000)
    : minMinutes;

  return {
    top: (startMin - windowStartMinutes) * pxPerMinute,
    height: durationMin * pxPerMinute,
    startMin,
    durationMin,
  };
}

// Pixel offset of "now" on the axis, for the now-line. Null when unavailable.
export function nowOffset({
  now = new Date(),
  timeZone,
  windowStartMinutes = 0,
  pxPerMinute = GRID_PX_PER_MINUTE,
} = {}) {
  const min = minutesIntoDay(now, timeZone);
  if (min == null) return null;
  return (min - windowStartMinutes) * pxPerMinute;
}

// Hour labels for the axis between two hours, inclusive of start and end.
// Human label for a zone, for the "Times in …" chip: a city and its current UTC
// offset. Falls back gracefully if the zone is unknown to the runtime.
export function timeZoneDisplay(timeZone) {
  if (!timeZone) return { city: "your time", offset: "" };
  const city = timeZone.split("/").pop().replace(/_/g, " ");
  let offset = "";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    offset = parts.find((p) => p.type === "timeZoneName")?.value || "";
  } catch {
    offset = "";
  }
  return { city, offset };
}

export function hourLabels({ startHour = 0, endHour = 24 } = {}) {
  const out = [];
  for (let h = startHour; h <= endHour; h++) {
    out.push(`${String(h).padStart(2, "0")}:00`);
  }
  return out;
}

// Height of the scrollable body for a window, so CSS and JS cannot disagree.
export function windowHeightPx({
  startHour = 0,
  endHour = 24,
  pxPerHour = GRID_PX_PER_HOUR,
} = {}) {
  return (endHour - startHour) * pxPerHour;
}

// Side-by-side lanes for items that overlap in time, so two events on the same
// row are both readable instead of drawn on top of each other.
//
// Greedy first-fit: within a cluster of mutually-overlapping items each takes
// the lowest lane whose previous item has already ended. A cluster ends when
// the next item starts after everything open has finished, which resets the
// lane pool — otherwise one busy morning would force every afternoon block into
// a narrow column for the rest of the day. Input `start`/`end` may be pixels or
// milliseconds; output preserves input order and adds `lane` (0-based) and
// `cols` (the cluster's lane count).
export function layoutOverlaps(items = []) {
  const order = items.map((item, index) => ({ index, start: Number(item.start), end: Number(item.end) }));
  order.sort((a, b) => a.start - b.start || a.end - b.end || a.index - b.index);

  const layout = new Map();
  let cluster = [];
  let laneEnds = [];
  let clusterEnd = -Infinity;

  function flush() {
    if (!cluster.length) return;
    const cols = Math.max(laneEnds.length, 1);
    for (const item of cluster) layout.set(item.index, { lane: item.lane, cols });
    cluster = [];
    laneEnds = [];
    clusterEnd = -Infinity;
  }

  for (const item of order) {
    if (!Number.isFinite(item.start) || !Number.isFinite(item.end)) continue;
    if (cluster.length && item.start >= clusterEnd) flush();

    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    item.lane = lane;
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();

  return items.map((item, index) => ({
    ...item,
    lane: layout.get(index)?.lane ?? 0,
    cols: layout.get(index)?.cols ?? 1,
  }));
}
