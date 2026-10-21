"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, Globe, Pencil, Plus, Trash2, Users, ChevronLeft, ChevronRight, X, Bell } from "lucide-react";
import {
  RECURRING_OPTIONS,
  recurringLabel,
  recurringWeekday,
} from "@/lib/server/availability-core";
import {
  DEFAULT_WINDOW_END_MINUTES,
  DEFAULT_WINDOW_START_MINUTES,
  blockGeometry,
  dayKeyFor,
  formatClock,
  formatDay,
  hourLabels,
  layoutOverlaps,
  nowOffset,
  timeZoneDisplay,
  windowHeightPx,
  addCalendarDays,
  calendarMonthKey,
  calendarWeekday,
  dateForCalendarDay,
  formatZoneOffset,
  zonedDateTimeToDate,
  zonedParts,
} from "@/lib/calendar-core";
import { buildEventIcs, icsFilename } from "@/lib/ics-core";
import styles from "./calendar.module.css";

const ROOMS = [
  { slug: "happy-hour-hub", name: "Happy Hour Hub", color: "#e91e63" },
  { slug: "lo-fi-and-loops", name: "Lo-Fi & Loops", color: "#2dd4bf" },
  { slug: "velvet-den", name: "The Velvet Den", color: "#a78bfa" },
  { slug: "silent-studio", name: "The Silent Studio", color: "#94a3b8" },
];

function roomName(slug) {
  return ROOMS.find((r) => r.slug === slug)?.name || slug || "";
}

// The three item kinds the PRD distinguishes. Colour is never the only signal:
// each chip and block also carries a label or an outline style.
const ITEM_TYPES = [
  { kind: "event", label: "Lounge events", swatch: "swatchEvent" },
  { kind: "availability", label: "Availability", swatch: "swatchAvailability" },
  { kind: "course", label: "Courses", swatch: "swatchCourse" },
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// A short list so members can pin the calendar to a home city rather than
// whatever zone the device happens to report. Browser default is prepended.
const EXTRA_ZONES = [
  "Africa/Nairobi",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Toronto",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

const TIMEZONE_STORAGE_KEY = "yarnery-calendar-timezone";

const REMINDERS_STORAGE_KEY = "yarnery-calendar-reminders";

function browserTimeZone() {
  if (typeof window === "undefined") return "UTC";
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function initialTimeZone() {
  if (typeof window === "undefined") return "UTC";
  try {
    return window.localStorage.getItem(TIMEZONE_STORAGE_KEY) || browserTimeZone();
  } catch {
    return browserTimeZone();
  }
}

function startOfDay(d) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function addDays(d, n) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function addMinutes(d, m) {
  return new Date(d.getTime() + m * 60000);
}

function snapToWeekday(start, recurring, timeZone) {
  const wd = recurringWeekday(recurring);
  if (wd == null) return start;
  const weekday = calendarWeekday(start, timeZone);
  const shift = (wd - weekday + 7) % 7;
  if (shift === 0) return start;
  const targetKey = dayKeyFor(addCalendarDays(start, shift, timeZone), timeZone);
  const parts = zonedParts(start, timeZone);
  if (!parts || !targetKey) return start;
  return zonedDateTimeToDate(
    targetKey,
    `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
    timeZone
  );
}

// Resolve a recurring availability occurrence on a viewer's calendar day.
// Recurrence is anchored to the creator's wall clock and IANA zone, while the
// occurrence is grouped under the day it actually falls on for this viewer.
function recurringOccurrenceOnDay(block, day, viewerZone) {
  if (!block.recurring || block.recurring === "none") return null;
  const sourceZone = block.timeZone || viewerZone;
  const originalStart = new Date(block.startAt);
  const originalEnd = new Date(block.endAt || block.startAt);
  if (!Number.isFinite(originalStart.getTime())) return null;

  const sourceParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: sourceZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(originalStart).reduce((parts, part) => {
    if (part.type !== "literal") parts[part.type] = part.value;
    return parts;
  }, {});
  const originalKey = `${sourceParts.year}-${sourceParts.month}-${sourceParts.day}`;
  const wantedWeekday = recurringWeekday(block.recurring);
  const anchorWeekday = calendarWeekday(originalStart, sourceZone);
  const repeatsOn = wantedWeekday == null ? anchorWeekday : wantedWeekday;
  const viewerKey = dayKeyFor(day, viewerZone);
  const duration = Number.isFinite(originalEnd.getTime())
    ? Math.max(0, originalEnd.getTime() - originalStart.getTime())
    : 0;

  // A viewer-day can overlap two source-zone dates. Check a small surrounding
  // window so UTC+14 and UTC-12 members see the same occurrence exactly once.
  for (let offset = -2; offset <= 2; offset += 1) {
    const candidateDay = addCalendarDays(day, offset, sourceZone);
    const candidateKey = dayKeyFor(candidateDay, sourceZone);
    if (!candidateKey || candidateKey < originalKey) continue;
    if (calendarWeekday(candidateDay, sourceZone) !== repeatsOn) continue;
    const start = zonedDateTimeToDate(
      candidateKey,
      `${sourceParts.hour}:${sourceParts.minute}`,
      sourceZone
    );
    if (!Number.isFinite(start.getTime()) || dayKeyFor(start, viewerZone) !== viewerKey) continue;
    return {
      ...block,
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + duration).toISOString(),
    };
  }
  return null;
}

export default function MatchmakerCalendar({ userId, userName, userAvatar }) {
  const [view, setView] = useState("week");
  const [anchor, setAnchor] = useState(() => new Date());
  // The single zone every label and grid offset is derived from. Resolved on the
  // client so the server's zone never leaks in; UTC until mounted. Members can
  // pin it to a home city via the chip.
  const [timeZone, setTimeZone] = useState(() => initialTimeZone());
  const [availability, setAvailability] = useState([]);
  const [events, setEvents] = useState([]);
  const [filters, setFilters] = useState(() => ({ event: true, availability: true, course: true }));
  const [matchOnly, setMatchOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  // The member's own block currently open for editing (see updateSlot below).
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [toast, setToast] = useState("");
  const [reminders, setReminders] = useState(() => new Set());
  const notifiedRef = useRef(new Set());
  // The week/day axis opens on waking hours instead of a dead 00:00–08:00.
  const [showAllHours, setShowAllHours] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const scrollRef = useRef(null);

  const refresh = useCallback(async () => {
    const from = new Date();
    const to = addDays(from, 60);
    const qs = `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
    try {
      // Availability and lounge events come from different endpoints but share
      // one grid, so they are fetched together and merged below.
      const [avRes, evRes] = await Promise.all([
        fetch(`/api/availability?${qs}`, { credentials: "include" }),
        fetch("/api/events", { credentials: "include" }),
      ]);
      if (!avRes.ok) throw new Error("Could not load the calendar");
      const avData = await avRes.json();
      setAvailability(avData.availability || []);
      if (evRes.ok) {
        const evData = await evRes.json();
        setEvents(Array.isArray(evData.events) ? evData.events : []);
      }
    } catch (e) {
      setError(e.message || "Could not load the calendar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch: refresh() only updates state after the async response
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    // Read persisted reminders after mount so server and client first render
    // agree (localStorage is not available on the server).
    try {
      const stored = JSON.parse(window.localStorage.getItem(REMINDERS_STORAGE_KEY) || "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydrate from storage
      if (Array.isArray(stored) && stored.length) setReminders(new Set(stored));
    } catch {
      // Storage disabled: reminders simply start empty.
    }
  }, []);

  useEffect(() => {
    if (!selected && !showAdd && !editing) return undefined;
    function onKeyDown(event) {
      if (event.key !== "Escape") return;
      setSelected(null);
      setShowAdd(false);
      setEditing(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, showAdd, editing]);

  const mine = useMemo(() => {
    const set = new Set();
    availability.forEach((a) => {
      if (a.userId === userId) set.add(a.id);
    });
    return set;
  }, [availability, userId]);

  const mineRanges = useMemo(
    () =>
      availability
        .filter((a) => a.userId === userId)
        .map((a) => [new Date(a.startAt).getTime(), new Date(a.endAt || a.startAt).getTime()]),
    [availability, userId]
  );

  // One list for the grid: member availability plus lounge events. Each carries  // a `kind` so the renderer (and the filter chips) can tell them apart.
  const items = useMemo(() => {
    const av = availability.map((a) => ({
      ...a,
      kind: "availability",
      roomName: a.roomName || roomName(a.roomSlug),
    }));
    const ev = events.map((e) => ({
      id: `event-${e.id}`,
      kind: "event",
      title: e.title,
      note: e.description || "",
      startAt: e.startTime,
      endAt: e.endTime,
      roomSlug: e.roomSlug || "",
      roomName: roomName(e.roomSlug),
      userName: "",
      userAvatar: "",
      rsvpCount: 0,
      recurring: "none",
      eventId: e.id,
    }));
    return [...av, ...ev];
  }, [availability, events]);

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (filters[item.kind] === false) return false;
        if (matchOnly && item.kind === "availability" && item.userId !== userId && mineRanges.length) {
          const start = new Date(item.startAt).getTime();
          const end = new Date(item.endAt || item.startAt).getTime();
          return mineRanges.some(([ms, me]) => start < me && end > ms);
        }
        return true;
      }),
    [items, filters, matchOnly, userId, mineRanges]
  );

  const nextUp = useMemo(() => {
    const from = now.getTime();
    return (
      items
        .map((item) => ({ item, at: new Date(item.startAt).getTime() }))
        .filter(({ at }) => Number.isFinite(at) && at >= from)
        .sort((a, b) => a.at - b.at)[0]?.item || null
    );
  }, [items, now]);

  function toggleFilter(kind) {
    setFilters((prev) => ({ ...prev, [kind]: !prev[kind] }));
  }

  function toggleReminder(block) {
    if (!block.eventId) return;
    const has = reminders.has(block.eventId);
    setReminders((prev) => {
      const next = new Set(prev);
      if (has) next.delete(block.eventId);
      else next.add(block.eventId);
      try {
        window.localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // Storage disabled: the reminder still applies for this session.
      }
      return next;
    });
    if (has) {
      setToast("Reminder removed");
      return;
    }
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    setToast("Reminder set — we'll nudge you 15 minutes before");
  }

  function downloadEvent(block) {
    const ics = buildEventIcs({
      id: block.eventId,
      title: block.title,
      description: block.note,
      startTime: block.startAt,
      endTime: block.endAt,
      roomName: block.roomName,
      url: typeof window === "undefined" ? "" : `${window.location.origin}/rooms/${block.roomSlug}`,
    });
    if (!ics) return;
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = icsFilename(block.title);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setToast("Calendar file downloaded");
  }

  // Calendar columns represent dates in the selected IANA zone, not the
  // computer's local zone. Each day anchor is noon in that zone so DST and
  // cross-midnight boundaries cannot shift the visible date.
  const viewStart = useMemo(() => {
    const anchorKey = dayKeyFor(anchor, timeZone);
    if (!anchorKey) return new Date(NaN);
    if (view === "month") {
      const monthKey = calendarMonthKey(anchor, timeZone);
      return dateForCalendarDay(`${monthKey}-01`, timeZone);
    }
    const base = dateForCalendarDay(anchorKey, timeZone);
    return addCalendarDays(base, -calendarWeekday(base, timeZone), timeZone);
  }, [anchor, view, timeZone]);

  const days = useMemo(() => {
    if (view === "day") {
      return [dateForCalendarDay(dayKeyFor(anchor, timeZone), timeZone)];
    }
    if (view === "week") {
      return Array.from({ length: 7 }, (_, i) => addCalendarDays(viewStart, i, timeZone));
    }
    const monthKey = calendarMonthKey(anchor, timeZone);
    const first = dateForCalendarDay(`${monthKey}-01`, timeZone);
    const gridStart = addCalendarDays(first, -calendarWeekday(first, timeZone), timeZone);
    return Array.from({ length: 42 }, (_, i) => addCalendarDays(gridStart, i, timeZone));
  }, [view, viewStart, anchor, timeZone]);

  const windowStartHour = showAllHours ? 0 : DEFAULT_WINDOW_START_MINUTES / 60;
  const windowEndHour = showAllHours ? 24 : DEFAULT_WINDOW_END_MINUTES / 60;
  const windowStartMinutes = windowStartHour * 60;

  const hours = useMemo(
    () => hourLabels({ startHour: windowStartHour, endHour: windowEndHour }),
    [windowStartHour, windowEndHour]
  );

  // A ticking clock for the now-line. One minute is plenty.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const nowPos = nowOffset({
    now,
    timeZone,
    windowStartMinutes,
  });

  // Fire "starting soon" reminders while the calendar is open. Notifications
  // are best-effort: permission may be denied and the tab may be closed.
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const nowMs = now.getTime();
    const soon = nowMs + 15 * 60 * 1000;
    events.forEach((event) => {
      if (!reminders.has(event.id) || notifiedRef.current.has(event.id)) return;
      const start = new Date(event.startTime).getTime();
      if (!Number.isFinite(start) || start <= nowMs || start > soon) return;
      notifiedRef.current.add(event.id);
      new Notification(`Starting soon: ${event.title}`, {
        body: `${formatClock(event.startTime, timeZone)} · ${roomName(event.roomSlug)}`,
      });
    });
  }, [now, events, reminders, timeZone]);

  // Bring the current time into view on first paint and whenever the window
  // changes, rather than dropping the member at 00:00. The position is read
  // once inside the effect so the once-a-minute clock tick does not yank the
  // viewport back while scrolling.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pos = nowOffset({ now: new Date(), timeZone, windowStartMinutes });
    if (pos == null) return;
    el.scrollTop = Math.max(0, pos - el.clientHeight / 3);
    // windowStartMinutes derives from showAllHours; view and timeZone are the
    // other things that change what "now" should scroll to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAllHours, view, timeZone]);

  const zoneOptions = useMemo(
    () => Array.from(new Set([browserTimeZone(), ...EXTRA_ZONES])),
    []
  );
  const tz = timeZoneDisplay(timeZone);

  const blocksForDay = (day) => {
    const key = dayKeyFor(day, timeZone);
    return visibleItems
      .flatMap((item) => {
        if (item.recurring && item.recurring !== "none") {
          const occurrence = recurringOccurrenceOnDay(item, day, timeZone);
          return occurrence ? [occurrence] : [];
        }
        return dayKeyFor(item.startAt, timeZone) === key ? [item] : [];
      })
      .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  };

  async function createSlot(fields) {
    setError("");
    try {
      const res = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create your block");
        return false;
      }
      setShowAdd(false);
      setToast("Your availability is live on the calendar");
      await refresh();
      return true;
    } catch {
      setError("Could not create your block");
      return false;
    }
  }

  async function updateSlot(id, fields) {
    setError("");
    try {
      const res = await fetch(`/api/availability/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not update your block");
        return false;
      }
      setToast("Your block is updated");
      await refresh();
      return true;
    } catch {
      setError("Could not update your block");
      return false;
    }
  }

  async function deleteSlot(id) {
    try {
      const res = await fetch(`/api/availability/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Could not delete");
      setToast("Block removed");
      await refresh();
    } catch {
      setError("Could not delete that block");
    }
  }

  async function toggleRsvp(avail) {
    setBusyId(avail.id);
    setError("");
    try {
      const res = await fetch(`/api/availability/${avail.id}/rsvp`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not toggle");
        return;
      }
      if (data.joined) setToast(`You're stitching along — "${avail.title}"`);
      else setToast("Stitch-along cancelled");
      await refresh();
    } catch {
      setError("Could not toggle stitch-along");
    } finally {
      setBusyId("");
    }
  }

  function navigate(dir) {
    if (view === "month") {
      const key = calendarMonthKey(anchor, timeZone);
      const [year, month] = key.split("-").map(Number);
      const target = new Date(Date.UTC(year, month - 1 + dir, 1, 12));
      const targetKey = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-01`;
      setAnchor(dateForCalendarDay(targetKey, timeZone));
    } else {
      setAnchor(addCalendarDays(anchor, view === "week" ? dir * 7 : dir, timeZone));
    }
  }

  function gotoToday() {
    setAnchor(dateForCalendarDay(dayKeyFor(new Date(), timeZone), timeZone));
  }

  function changeTimeZone(next) {
    setTimeZone(next);
    try {
      window.localStorage.setItem(TIMEZONE_STORAGE_KEY, next);
    } catch {
      // Private browsing or storage disabled: the session still works.
    }
  }

  const todayKey = dayKeyFor(new Date(), timeZone);

  // The narrow-screen agenda: the same blocks the grid shows, flattened into a
  // date-headed list so a phone never has to scroll a seven-column grid.
  const agendaDays = days
    .map((day) => ({ day, key: dayKeyFor(day, timeZone), blocks: blocksForDay(day) }))
    .filter((entry) => entry.blocks.length > 0)
    .filter((entry) => view !== "month" || calendarMonthKey(entry.day, timeZone) === calendarMonthKey(anchor, timeZone));

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.viewSwitch}>
          {["day", "week", "month"].map((v) => (
            <button
              key={v}
              className={view === v ? `${styles.viewBtn} ${styles.viewActive}` : styles.viewBtn}
              onClick={() => setView(v)}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <div className={styles.navBtns}>
          <button className={styles.iconBtn} onClick={() => navigate(-1)} aria-label="Previous">
            <ChevronLeft size={18} />
          </button>
          <button className={styles.todayBtn} onClick={gotoToday}>Today</button>
          <button className={styles.iconBtn} onClick={() => navigate(1)} aria-label="Next">
            <ChevronRight size={18} />
          </button>
          <button
            type="button"
            className={styles.todayBtn}
            onClick={() => setShowAllHours((v) => !v)}
            aria-pressed={showAllHours}
            title={showAllHours ? "Show daytime hours only" : "Show all 24 hours"}
          >
            {showAllHours ? "Daytime" : "24h"}
          </button>
        </div>
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => {
            setError("");
            setEditing(null);
            setShowAdd(true);
          }}
          aria-haspopup="dialog"
          aria-label="Add availability"
        >
          <Plus size={16} /> Add Availability
        </button>
      </div>

      <div className={styles.dateRow}>
        <p className={styles.viewLabel}>
          {view === "month"
            ? formatDay(anchor, timeZone, {
                month: "long",
                year: "numeric",
                weekday: undefined,
                day: undefined,
              })
            : `${formatDay(days[0], timeZone)} — ${formatDay(days[days.length - 1], timeZone)}`}
        </p>
        <label className={styles.tzChip}>
          <Globe size={14} aria-hidden="true" />
          <span>
            Times in {tz.city}
            {tz.offset ? ` (${tz.offset})` : ""}
          </span>
          <select
            className={styles.tzSelect}
            value={timeZone}
            onChange={(e) => changeTimeZone(e.target.value)}
            aria-label="Time zone"
          >
            {zoneOptions.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.legend} role="group" aria-label="Filter calendar items">
        {ITEM_TYPES.map((type) => (
          <button
            key={type.kind}
            type="button"
            className={`${styles.legendChip} ${filters[type.kind] ? styles.legendOn : ""}`}
            onClick={() => toggleFilter(type.kind)}
            aria-pressed={filters[type.kind]}
          >
            <span className={`${styles.swatch} ${styles[type.swatch]}`} aria-hidden="true" />
            {type.label}
          </button>
        ))}
        <button
          type="button"
          className={`${styles.legendChip} ${matchOnly ? styles.legendOn : ""}`}
          onClick={() => setMatchOnly((v) => !v)}
          aria-pressed={matchOnly}
          title="Only show availability that overlaps your own"
        >
          <CalendarDays size={13} aria-hidden="true" />
          Matches me
        </button>
      </div>

      {nextUp && (
        <div className={styles.upNext}>
          <div className={styles.upNextMain}>
            <span className={styles.upNextLabel}>Up next</span>
            <span className={styles.upNextTitle}>{nextUp.title}</span>
            <span className={styles.upNextWhen}>
              {formatDay(nextUp.startAt, timeZone)} · {formatClock(nextUp.startAt, timeZone)} {formatZoneOffset(nextUp.startAt, timeZone)}
              {nextUp.roomName ? ` · ${nextUp.roomName}` : ""}
            </span>
          </div>
          <div className={styles.upNextActions}>
            {nextUp.kind === "event" && nextUp.roomSlug && (
              <Link href={`/rooms/${nextUp.roomSlug}`} className={styles.upNextBtn}>
                Join lounge
              </Link>
            )}
            <button
              type="button"
              className={styles.upNextGhost}
              onClick={() => setSelected(nextUp)}
            >
              Details
            </button>
          </div>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}
      {toast && <p className={styles.toast}>{toast}</p>}

      {loading ? (
        <p className={styles.empty}>Loading calendar…</p>
      ) : (
        <>
          <div className={styles.agenda} aria-label="Agenda">
            {agendaDays.length === 0 ? (
              <p className={styles.empty}>Nothing scheduled in this range yet.</p>
            ) : (
              agendaDays.map((entry) => (
                <div key={entry.key} className={styles.agendaDay}>
                  <h3 className={styles.agendaDate}>
                    {formatDay(entry.day, timeZone, {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })}
                  </h3>
                  {entry.blocks.map((block) => (
                    <button
                      key={block.id}
                      type="button"
                      className={styles.agendaItem}
                      onClick={() => setSelected(block)}
                    >
                      <span className={styles.agendaTime}>
                        {formatClock(block.startAt, timeZone)} {formatZoneOffset(block.startAt, timeZone)}
                      </span>
                      <span
                        className={`${styles.swatch} ${
                          block.kind === "event"
                            ? styles.swatchEvent
                            : block.kind === "course"
                              ? styles.swatchCourse
                              : styles.swatchAvailability
                        }`}
                        aria-hidden="true"
                      />
                      <span className={styles.agendaBody}>
                        <span className={styles.agendaTitle}>{block.title}</span>
                        <span className={styles.agendaMeta}>
                          {block.roomName}
                          {block.kind === "availability" && block.userName
                            ? ` · ${block.userName}`
                            : ""}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

          {(view === "week" || view === "day") && (
            <div className={styles.timeGridWrap} ref={scrollRef}>
              <div className={styles.timeCol}>
                <div className={styles.timeSpacer} />
                {hours.map((h) => (
                  <div key={h} className={styles.timeSlot}>
                    <span className={styles.timeLabel}>{h}</span>
                  </div>
                ))}
              </div>
              <div className={view === "day" ? styles.dayCols : styles.weekCols}>
                {days.map((day) => {
                  const blocks = blocksForDay(day);
                  const key = dayKeyFor(day, timeZone);
                  const isToday = key === todayKey;
                  return (
                    <div
                      key={key}
                      className={`${styles.dayCol} ${
                        calendarWeekday(day, timeZone) === 0 || calendarWeekday(day, timeZone) === 6 ? styles.weekendCol : ""
                      }`}
                    >
                      <div
                        className={`${styles.dayHead} ${isToday ? styles.todayHead : ""}`}
                      >
                        <span>{WEEKDAYS[calendarWeekday(day, timeZone)]}</span>
                        <span
                          className={`${styles.dayNum} ${isToday ? styles.todayNum : ""}`}
                        >
                          {Number(key.slice(-2))}
                        </span>
                      </div>
                      <div
                        className={styles.dayBody}
                        style={{ height: windowHeightPx({ startHour: windowStartHour, endHour: windowEndHour }) }}
                      >
                        {isToday && nowPos != null && (
                          <div
                            className={styles.nowLine}
                            style={{ top: nowPos }}
                            aria-hidden="true"
                          >
                            <span className={styles.nowDot} />
                          </div>
                        )}
                        {(() => {
                          // Position every block first, then let layoutOverlaps
                          // split overlaps into side-by-side lanes so two events
                          // at the same hour are both readable.
                          const laid = layoutOverlaps(
                            blocks
                              .map((block) => {
                                const g = blockGeometry({
                                  startAt: block.startAt,
                                  endAt: block.endAt,
                                  timeZone,
                                  windowStartMinutes,
                                });
                                return g ? { block, g, start: g.top, end: g.top + g.height } : null;
                              })
                              .filter(Boolean)
                          );
                          return laid.map(({ block, g, lane, cols }) => {
                            const widthPct = 100 / cols;
                            const leftPct = lane * widthPct;
                            const isMine = mine.has(block.id);
                            const typeClass =
                              block.kind === "event"
                                ? styles.blockEvent
                                : block.kind === "course"
                                  ? styles.blockCourse
                                  : styles.blockAvailability;
                            const range = `${formatClock(block.startAt, timeZone)}${
                              block.endAt ? ` – ${formatClock(block.endAt, timeZone)}` : ""
                            }`;
                            const meta =
                              block.kind === "availability"
                                ? `${range} · ${block.userName ? `${block.userName} · ` : ""}online`
                                : `${range}${block.roomName ? ` · ${block.roomName}` : ""}`;
                            return (
                              <button
                                key={block.id}
                                type="button"
                                className={`${styles.block} ${typeClass} ${isMine ? styles.blockMine : ""}`}
                                style={{
                                  top: g.top,
                                  minHeight: Math.max(g.height - 4, 22),
                                  left: `calc(${leftPct}% + 3px)`,
                                  width: `calc(${widthPct}% - 6px)`,
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelected(block);
                                }}
                                aria-label={`${block.title}, ${formatDay(day, timeZone, {
                                  weekday: "long",
                                  month: "long",
                                  day: "numeric",
                                  year: "numeric",
                                })}, ${range}${block.roomName ? `, ${block.roomName}` : ""}`}
                              >
                                <span className={styles.blockTitle}>{block.title}</span>
                                <span className={styles.blockMeta}>{meta}</span>
                              </button>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {view === "month" && (
            <div className={styles.monthGrid}>
              {WEEKDAYS.map((w) => (
                <div key={w} className={styles.monthWeekday}>{w}</div>
              ))}
              {days.map((day) => {
                const key = dayKeyFor(day, timeZone);
                const blocks = blocksForDay(day);
                const inMonth = calendarMonthKey(day, timeZone) === calendarMonthKey(anchor, timeZone);
                return (
                  <div
                    key={key}
                    className={`${styles.monthCell} ${inMonth ? "" : styles.monthOut} ${key === todayKey ? styles.monthToday : ""}`}
                  >
                    <span className={styles.monthDayNum}>{day.getDate()}</span>
                    <div className={styles.monthBlocks}>
                      {blocks.slice(0, 3).map((block) => (
                        <button
                          key={block.id}
                          type="button"
                          className={`${styles.monthBlock} ${
                            block.kind === "event"
                              ? styles.monthBlockEvent
                              : block.kind === "course"
                                ? styles.monthBlockCourse
                                : styles.monthBlockAvailability
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(block);
                          }}
                        >
                          {block.title}
                        </button>
                      ))}
                      {blocks.length > 3 && (
                        <span className={styles.monthMore}>+{blocks.length - 3} more</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {items.length === 0 && (
            <p className={styles.empty}>
              No availability yet. Click &ldquo;Add Availability&rdquo; to tell the community when you&apos;ll be online.
            </p>
          )}
        </>
      )}

      {showAdd && (
        <AddAvailabilityForm
          onClose={() => {
            setShowAdd(false);
            setError("");
          }}
          onSave={createSlot}
          defaultValue={new Date()}
          timeZone={timeZone}
        />
      )}

      {editing && (
        <AddAvailabilityForm
          initial={editing}
          onClose={() => {
            setEditing(null);
            setError("");
          }}
          onSave={(fields) => updateSlot(editing.id, fields)}
          defaultValue={new Date()}
          timeZone={timeZone}
        />
      )}

      {selected && (
        <SelectedModal
          block={selected}
          mine={mine.has(selected.id)}
          userId={userId}
          timeZone={timeZone}
          now={now}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditing(selected);
            setSelected(null);
          }}
          onDelete={() => deleteSlot(selected.id).then(() => setSelected(null))}
          onToggle={() => toggleRsvp(selected)}
          onRemind={() => toggleReminder(selected)}
          onDownload={() => downloadEvent(selected)}
          isReminded={Boolean(selected.eventId) && reminders.has(selected.eventId)}
          busy={busyId === selected.id}
        />
      )}
    </>
  );
}

function AddAvailabilityForm({ onClose, onSave, defaultValue, initial, timeZone }) {
  const isEdit = Boolean(initial);
  // Seed the date picker from the viewer's own day. toISOString().slice(0,10)
  // is UTC and pre-filled tomorrow for anyone east of Greenwich after local
  // midnight but before the UTC date rolls over.
  const formTimeZone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [title, setTitle] = useState(() => initial?.title || "");
  const [roomSlug, setRoomSlug] = useState(() => initial?.roomSlug || "");
  const [startDate, setStartDate] = useState(() =>
    isEdit
      ? dayKeyFor(new Date(initial.startAt), formTimeZone) || ""
      : dayKeyFor(defaultValue, formTimeZone) || ""
  );
  // Seed and parse date/time fields in the selected calendar zone, not the
  // device zone, so choosing London while in Nairobi still schedules London time.
  const [startTime, setStartTime] = useState(() => {
    if (!isEdit) return "18:00";
    return formatClock(initial.startAt, formTimeZone);
  });
  const [duration, setDuration] = useState(() => {
    if (!isEdit) return "90";
    const mins = Math.round((new Date(initial.endAt) - new Date(initial.startAt)) / 60000);
    return String(Number.isFinite(mins) && mins > 0 ? mins : 90);
  });
  const [recurring, setRecurring] = useState(() => initial?.recurring || "none");
  const [note, setNote] = useState(() => initial?.note || "");
  // Opt-in: a block is an offer of time by default, and promoting it creates a
  // real meetup that shows up on /events. Not every block should become one.
  // Editing never touches promotion: the block and its meetup move together.
  const [makeEvent, setMakeEvent] = useState(false);
  // Opt-in: pinning surfaces the block on everyone's dashboard What's On band.
  // Unlike promotion this is reversible, so it is offered on create and edit.
  const [pinned, setPinned] = useState(() => initial?.pinned === true);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) {
      setLocalError("Give your block a fun title.");
      return;
    }
    const picked = zonedDateTimeToDate(startDate, startTime, formTimeZone);
    if (!Number.isFinite(picked.getTime())) {
      setLocalError("Choose a valid date, time, and time zone.");
      return;
    }
    const start = snapToWeekday(picked, recurring, formTimeZone);
    const end = addMinutes(start, Number(duration) || 90);
    setSaving(true);
    // ISO timestamps preserve the exact instant; timeZone preserves the
    // intended wall clock for recurring availability and future edits.
    const payload = {
      title: title.trim(),
      roomSlug,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      timeZone: formTimeZone,
      recurring,
      note,
      pinned,
    };
    // Promotion is a create-time decision; edits never add or remove a meetup.
    if (!isEdit) payload.makeEvent = makeEvent;
    const ok = await onSave(payload);
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <div className={styles.modalBackdrop} onMouseDown={onClose} role="presentation">
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="add-availability-title">
        <div className={styles.modalHead}>
          <h2 id="add-availability-title" className={styles.modalTitle}>
            {isEdit ? "Edit Availability" : "Add Availability"}
          </h2>
          <button className={styles.iconBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className={styles.modalSub}>
          {isEdit
            ? "Update when you'll be online — everyone on the calendar sees the change right away."
            : "Broadcast when you'll have your hook in hand. Members will see you on the calendar and can stitch along."}
        </p>
        <form onSubmit={handleSubmit} className={styles.addForm}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Block title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Christa's Morning Coffee Stash"
              maxLength={60}
              className={styles.input}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Which lounge?</span>
            <select
              value={roomSlug}
              onChange={(e) => setRoomSlug(e.target.value)}
              className={styles.input}
            >
              <option value="">Any 24/7 lounge</option>
              {ROOMS.map((r) => (
                <option key={r.slug} value={r.slug}>{r.name}</option>
              ))}
            </select>
          </label>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Date</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={styles.input}
                required
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Time</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={styles.input}
                required
              />
            </label>
          </div>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Duration</span>
              <select value={duration} onChange={(e) => setDuration(e.target.value)} className={styles.input}>
                {/* An edited block can carry a duration outside the preset list. */}
                {!["30", "60", "90", "120", "180"].includes(duration) && (
                  <option value={duration}>{duration} min</option>
                )}
                <option value="30">30 min</option>
                <option value="60">1 hour</option>
                <option value="90">1.5 hours</option>
                <option value="120">2 hours</option>
                <option value="180">3 hours</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Repeat</span>
              <select value={recurring} onChange={(e) => setRecurring(e.target.value)} className={styles.input}>
                {/* Legacy blocks store bare "weekly" (own weekday), which the
                    normalised option list no longer includes. */}
                {recurring === "weekly" && <option value="weekly">Every week</option>}
                {RECURRING_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
          </div>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Note (optional)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What are you working on?"
              maxLength={300}
              className={styles.input}
            />
          </label>
          {!isEdit && (
            <label className={styles.fieldRow}>
              <span className={styles.fieldLabel}>
                <input
                  type="checkbox"
                  checked={makeEvent}
                  onChange={(e) => setMakeEvent(e.target.checked)}
                />{" "}
                Also post this as a meetup
              </span>
            </label>
          )}
          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
              />{" "}
              Pin to What&apos;s On
            </span>
          </label>
          <p className={styles.fieldHint}>
            Pinned blocks show up on everyone&apos;s dashboard so members can see when you&apos;ll
            be stitching.
          </p>
          {localError && <p className={styles.error}>{localError}</p>}          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SelectedModal({
  block,
  mine,
  userId,
  timeZone,
  now,
  onClose,
  onEdit,
  onDelete,
  onToggle,
  onRemind,
  onDownload,
  isReminded,
  busy,
}) {
  const isEvent = block.kind === "event";
  const started = new Date(block.startAt).getTime() <= now.getTime();
  const dotColor =
    block.kind === "event" ? "#e91e63" : block.kind === "course" ? "#a78bfa" : "#2dd4bf";
  return (
    <div className={styles.modalBackdrop} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={block.title}>
        <div className={styles.selTop}>
          <span className={styles.selColorDot} style={{ background: dotColor }} />
          <h2 className={styles.modalTitle}>{block.title}</h2>
        </div>
        <p className={styles.modalSub}>
          <CalendarDays size={14} /> {formatDay(block.startAt, timeZone)} ·{" "}
          {formatClock(block.startAt, timeZone)}
          {block.endAt && ` – ${formatClock(block.endAt, timeZone)}`}
          {String(block.recurring) !== "none" && ` — ${recurringLabel(block.recurring)}`}
        </p>
        {block.roomSlug && (
          <p className={styles.selRoom}>
            <Link href={`/rooms/${block.roomSlug}`} className={styles.roomLink}>
              {block.roomName}
            </Link>
          </p>
        )}
        {!isEvent && (
          <div className={styles.selHost}>
            <span className={styles.selAvatar}>
              {block.userAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.selAvatarImg} src={block.userAvatar} alt="" />
              ) : (
                (block.userName || "?").charAt(0).toUpperCase()
              )}
            </span>
            <span className={styles.selHostName}>
              {block.userName}{" "}
              <span className={styles.selHostBadge}>({block.rsvpCount || 0} stitching)</span>
            </span>
          </div>
        )}
        {block.note && <p className={styles.selNote}>{block.note}</p>}
        <div className={styles.modalActions}>
          {isEvent ? (
            <>
              {block.roomSlug && (
                <Link href={`/rooms/${block.roomSlug}`} className={styles.saveBtn}>
                  <Users size={15} /> Join lounge
                </Link>
              )}
              <button className={styles.cancelBtn} onClick={onDownload}>
                <CalendarDays size={15} /> Add to calendar
              </button>
            </>
          ) : mine ? (
            <>
              <button className={styles.cancelBtn} onClick={onEdit}>
                <Pencil size={15} /> Edit
              </button>
              <button className={styles.dangerBtn} onClick={onDelete}>
                <Trash2 size={15} /> Delete
              </button>
            </>
          ) : (
            <button className={styles.saveBtn} onClick={onToggle} disabled={busy}>
              <Users size={15} /> {block.rsvpCount && block.rsvpCount > 0 ? `Stitching along (${block.rsvpCount})` : "Stitch Along"}
            </button>
          )}
          {isEvent && !started && (
            <button
              className={`${styles.cancelBtn} ${isReminded ? styles.remindedBtn : ""}`}
              onClick={onRemind}
              aria-pressed={isReminded}
            >
              <Bell size={15} /> {isReminded ? "Reminder on" : "Remind me"}
            </button>
          )}
          <button className={styles.cancelBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
