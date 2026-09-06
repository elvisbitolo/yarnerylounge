"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Plus, Trash2, Users, ChevronLeft, ChevronRight, X } from "lucide-react";
import styles from "./calendar.module.css";

const ROOMS = [
  { slug: "happy-hour-hub", name: "Happy Hour Hub", color: "#f472b6" },
  { slug: "lo-fi-and-loops", name: "Lo-Fi & Loops", color: "#2dd4bf" },
  { slug: "velvet-accent-den", name: "The Velvet Accent Den", color: "#a78bfa" },
  { slug: "silent-studio", name: "The Silent Studio", color: "#94a3b8" },
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toLocalKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function fmtBlock(iso) {
  const d = new Date(iso);
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${fmtTime(iso)}`;
}

export default function MatchmakerCalendar({ userId, userName, userAvatar }) {
  const [view, setView] = useState("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [availability, setAvailability] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [toast, setToast] = useState("");

  const refresh = useCallback(async () => {
    const from = new Date();
    const to = addDays(from, 60);
    const qs = `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
    try {
      const res = await fetch(`/api/availability?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not load the calendar");
      const data = await res.json();
      setAvailability(data.availability || []);
    } catch (e) {
      setError(e.message || "Could not load the calendar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const mine = useMemo(() => {
    const set = new Set();
    availability.forEach((a) => {
      if (a.userId === userId) set.add(a.id);
    });
    return set;
  }, [availability, userId]);

  const viewStart = useMemo(() => {
    const base = startOfDay(anchor);
    if (view === "month") {
      return new Date(base.getFullYear(), base.getMonth(), 1);
    }
    const day = base.getDay();
    return addDays(base, -day);
  }, [anchor, view]);

  const days = useMemo(() => {
    if (view === "day") return [startOfDay(anchor)];
    if (view === "week") return Array.from({ length: 7 }, (_, i) => addDays(viewStart, i));
    const first = startOfDay(viewStart);
    const total = 7 * 6;
    return Array.from({ length: total }, (_, i) => addDays(first, i - first.getDay()));
  }, [view, viewStart, anchor]);

  const hours = useMemo(
    () => Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`),
    []
  );

  const blocksForDay = (day) => {
    const key = toLocalKey(day);
    return availability
      .filter((a) => {
        if (a.recurring === "weekly") {
          const d = new Date(a.startAt);
          const diffDays = Math.round((startOfDay(day) - startOfDay(a.startAt)) / 86400000);
          return day >= startOfDay(new Date(a.startAt)) && diffDays % 7 === 0;
        }
        return toLocalKey(new Date(a.startAt)) === key;
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
      setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1));
    } else if (view === "week") {
      setAnchor(addDays(anchor, dir * 7));
    } else {
      setAnchor(addDays(anchor, dir));
    }
  }

  function gotoToday() {
    setAnchor(new Date());
  }

  const todayKey = toLocalKey(new Date());

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
        </div>
        <button className={styles.addBtn} onClick={() => setShowAdd(true)}>
          <Plus size={16} /> Add Availability
        </button>
      </div>

      <p className={styles.viewLabel}>
        {view === "month"
          ? anchor.toLocaleDateString([], { month: "long", year: "numeric" })
          : `${fmtDate(days[0].toISOString())} — ${fmtDate(days[days.length - 1].toISOString())}`}
      </p>

      {error && <p className={styles.error}>{error}</p>}
      {toast && <p className={styles.toast}>{toast}</p>}

      {loading ? (
        <p className={styles.empty}>Loading calendar…</p>
      ) : (
        <>
          {(view === "week" || view === "day") && (
            <div className={styles.timeGridWrap}>
              <div className={styles.timeCol}>
                <div className={styles.timeSpacer} />
                {hours.map((h) => (
                  <div key={h} className={styles.timeSlot}>
                    <span className={styles.timeLabel}>{h}</span>
                  </div>
                ))}
              </div>
              <div
                className={view === "day" ? styles.dayCols : styles.weekCols}
              >
                {days.map((day) => {
                  const blocks = blocksForDay(day);
                  const key = toLocalKey(day);
                  return (
                    <div key={key} className={styles.dayCol}>
                      <div className={`${styles.dayHead} ${key === todayKey ? styles.todayHead : ""}`}>
                        {WEEKDAYS[day.getDay()]} {day.getDate()}
                      </div>
                      <div className={styles.dayBody}>
                        {blocks.map((block) => {
                          const start = new Date(block.startAt);
                          const end = new Date(block.endAt);
                          const top = start.getHours() * 60 + start.getMinutes();
                          const span = Math.max(30, (end - start) / 60000);
                          const isMine = mine.has(block.id);
                          return (
                            <button
                              key={block.id}
                              type="button"
                              className={`${styles.block} ${isMine ? styles.blockMine : ""}`}
                              style={{
                                top,
                                minHeight: Math.max(30, span - 4),
                                background: block.color,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected(block);
                              }}
                            >
                              <span className={styles.blockTitle}>{block.title}</span>
                              <span className={styles.blockMeta}>
                                {fmtTime(block.startAt)} · {block.roomName}
                              </span>
                            </button>
                          );
                        })}
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
                const key = toLocalKey(day);
                const blocks = blocksForDay(day);
                const inMonth = day.getMonth() === anchor.getMonth();
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
                          className={styles.monthBlock}
                          style={{ background: block.color }}
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

          {availability.length === 0 && (
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
        />
      )}

      {selected && (
        <SelectedModal
          block={selected}
          mine={mine.has(selected.id)}
          userId={userId}
          onClose={() => setSelected(null)}
          onDelete={() => deleteSlot(selected.id).then(() => setSelected(null))}
          onToggle={() => toggleRsvp(selected)}
          busy={busyId === selected.id}
        />
      )}
    </>
  );
}

function AddAvailabilityForm({ onClose, onSave, defaultValue }) {
  const [title, setTitle] = useState("");
  const [roomSlug, setRoomSlug] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(defaultValue);
    return d.toISOString().slice(0, 10);
  });
  const [startTime, setStartTime] = useState("18:00");
  const [duration, setDuration] = useState("90");
  const [recurring, setRecurring] = useState("none");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) {
      setLocalError("Give your block a fun title.");
      return;
    }
    const start = new Date(`${startDate}T${startTime}`);
    const end = addMinutes(start, Number(duration) || 90);
    setSaving(true);
    const ok = await onSave({
      title: title.trim(),
      roomSlug,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      recurring,
      note,
    });
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <div className={styles.modalBackdrop} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h2 className={styles.modalTitle}>Add Availability</h2>
          <button className={styles.iconBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className={styles.modalSub}>
          Broadcast when you&apos;ll have your hook in hand. Members will see you on the calendar and can stitch along.
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
            <span className={styles.fieldLabel}>Which room?</span>
            <select
              value={roomSlug}
              onChange={(e) => setRoomSlug(e.target.value)}
              className={styles.input}
            >
              <option value="">Any 24/7 room</option>
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
                <option value="none">Once</option>
                <option value="weekly">Every week</option>
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
          {localError && <p className={styles.error}>{localError}</p>}
          <div className={styles.modalActions}>
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

function SelectedModal({ block, mine, userId, onClose, onDelete, onToggle, busy }) {
  return (
    <div className={styles.modalBackdrop} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.selTop}>
          <span className={styles.selColorDot} style={{ background: block.color }} />
          <h2 className={styles.modalTitle}>{block.title}</h2>
        </div>
        <p className={styles.modalSub}>
          <CalendarDays size={14} /> {fmtBlock(block.startAt)}
          {block.recurring === "weekly" && " — every week"}
          {block.endAt && ` · ${fmtTime(block.endAt)} end`}
        </p>
        {block.roomSlug && (
          <p className={styles.selRoom}>
            <Link href={`/rooms/${block.roomSlug}`} className={styles.roomLink}>
              {block.roomName}
            </Link>
          </p>
        )}
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
            {block.userName} <span className={styles.selHostBadge}>({block.rsvpCount || 0} stitching)</span>
          </span>
        </div>
        {block.note && <p className={styles.selNote}>{block.note}</p>}
        <div className={styles.modalActions}>
          {mine ? (
            <button className={styles.dangerBtn} onClick={onDelete}>
              <Trash2 size={15} /> Delete
            </button>
          ) : (
            <button className={styles.saveBtn} onClick={onToggle} disabled={busy}>
              <Users size={15} /> {block.rsvpCount && block.rsvpCount > 0 ? `Stitching along (${block.rsvpCount})` : "Stitch Along"}
            </button>
          )}
          <button className={styles.cancelBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}