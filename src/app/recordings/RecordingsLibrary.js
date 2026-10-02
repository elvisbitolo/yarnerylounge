"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { AlertTriangle, Film, LayoutGrid, List, Play, Search } from "lucide-react";
import {
  formatBytes,
  formatDuration,
  formatRecordingDate,
  formatRecordingTime,
  isNewRecording,
  recordingOrientation,
} from "@/lib/recordings-display";
import { captureVideoFrame } from "@/lib/recording-thumbnail";
import {
  getServerSnapshot,
  getSnapshot,
  subscribe,
  updateRecordingView,
} from "@/lib/recordings-view";
import RecordingPlayer from "./RecordingPlayer";
import styles from "./recordings.module.css";

// How often to check for a recording that finished pulling.
const POLL_MS = 8000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

export default function RecordingsLibrary({
  recordings,
  loadError,
  canDelete,
  currentUserId = null,
  storage = null,
}) {
  const t = useTranslations("recordings");
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { sort, view, chip } = prefs;
  const [items, setItems] = useState(recordings);
  const [activeId, setActiveId] = useState(null);
  const [playback, setPlayback] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [retryingId, setRetryingId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [query, setQuery] = useState("");
  const [lounge, setLounge] = useState("all");
  const [undo, setUndo] = useState(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [deletedItems, setDeletedItems] = useState([]);
  const [trashLoading, setTrashLoading] = useState(false);
  // Captured once per mount so "this week/month" does not shift mid-render.
  const [now] = useState(() => Date.now());
  // Poster frames already signed by the server, plus any captured this session.
  const [thumbs, setThumbs] = useState(() =>
    Object.fromEntries(
      recordings.filter((r) => r.thumbnailUrl).map((r) => [r.id, r.thumbnailUrl])
    )
  );

  const gridRef = useRef(null);
  const inFlightRef = useRef(new Set());
  const failedRef = useRef(new Set());
  const deepLinkedRef = useRef(false);

  const play = useCallback(
    async (recording) => {
      if (activeId === recording.id) {
        setActiveId(null);
        return;
      }
      setActiveId(recording.id);
      setNotice(null);
      if (playback[recording.id]?.url) return;
      setPlayback((prev) => ({ ...prev, [recording.id]: null }));
      try {
        const res = await fetch(`/api/recordings/${recording.id}/play`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error || t("playbackFailed"));
        setPlayback((prev) => ({ ...prev, [recording.id]: json }));
      } catch (error) {
        setPlayback((prev) => ({
          ...prev,
          [recording.id]: { error: error?.message || t("playbackFailed") },
        }));
      }
    },
    [activeId, playback, t]
  );

  // Deep link from a copied share URL: /recordings?rec=<id>.
  useEffect(() => {
    if (deepLinkedRef.current) return;
    deepLinkedRef.current = true;
    const id = new URLSearchParams(window.location.search).get("rec");
    if (!id) return;
    const target = items.find((r) => r.id === id && r.status === "ready");
    if (target) play(target);
  }, [items, play]);

  async function reloadLibrary() {
    try {
      const res = await fetch("/api/recordings?limit=60", { cache: "no-store" });
      const json = await res.json();
      if (json?.ok && Array.isArray(json.data)) setItems(json.data);
    } catch {
      /* keep the current list if the refresh fails */
    }
  }

  async function remove(recording) {
    if (!window.confirm(t("deleteConfirm"))) return;
    setBusyId(recording.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/recordings/${recording.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || t("deleteFailed"));
      setItems((prev) => prev.filter((r) => r.id !== recording.id));
      if (activeId === recording.id) setActiveId(null);
      setUndo({ id: recording.id, title: recording.title });
      setNotice({ type: "ok", text: t("movedToTrash") });
    } catch (error) {
      setNotice({ type: "error", text: error?.message || t("deleteFailed") });
    } finally {
      setBusyId(null);
    }
  }

  async function undoDelete() {
    if (!undo) return;
    const { id } = undo;
    setUndo(null);
    try {
      const res = await fetch(`/api/recordings/${id}/restore`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || t("restoreFailed"));
      setNotice({ type: "ok", text: t("restored") });
      await reloadLibrary();
    } catch (error) {
      setNotice({ type: "error", text: error?.message || t("restoreFailed") });
    }
  }

  async function openTrash() {
    setTrashOpen(true);
    setTrashLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/recordings?trash=1&limit=60", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || t("trashFailed"));
      setDeletedItems(json.data);
    } catch (error) {
      setNotice({ type: "error", text: error?.message || t("trashFailed") });
    } finally {
      setTrashLoading(false);
    }
  }

  async function restoreTrashed(recording) {
    try {
      const res = await fetch(`/api/recordings/${recording.id}/restore`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || t("restoreFailed"));
      setDeletedItems((prev) => prev.filter((r) => r.id !== recording.id));
      setNotice({ type: "ok", text: t("restored") });
      await reloadLibrary();
    } catch (error) {
      setNotice({ type: "error", text: error?.message || t("restoreFailed") });
    }
  }

  async function retry(recording) {
    setRetryingId(recording.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/recordings/${recording.id}/retry`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || t("retryFailed"));
      setItems((prev) =>
        prev.map((r) => (r.id === recording.id ? { ...r, status: "pending" } : r))
      );
      setNotice({ type: "ok", text: t("retryQueued") });
    } catch (error) {
      setNotice({ type: "error", text: error?.message || t("retryFailed") });
    } finally {
      setRetryingId(null);
    }
  }

  async function copyLink(recording) {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/recordings?rec=${recording.id}`
      );
      setNotice({ type: "ok", text: t("linkCopied") });
    } catch {
      setNotice({ type: "error", text: t("copyFailed") });
    }
  }

  // Capture a poster frame for a recording that has none. inFlightRef gates a
  // second request for the same row, and a failed row is not retried this
  // session.
  const requestThumbnail = useCallback(async (recording) => {
    if (inFlightRef.current.has(recording.id) || failedRef.current.has(recording.id)) return;
    inFlightRef.current.add(recording.id);
    try {
      const res = await fetch(`/api/recordings/${recording.id}/play`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.url) throw new Error("no_url");
      const frame = await captureVideoFrame(json.url);
      const upload = await fetch(`/api/recordings/${recording.id}/thumbnail`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          image: frame.dataUrl,
          width: frame.width,
          height: frame.height,
        }),
      });
      const saved = await upload.json();
      if (!upload.ok || !saved?.thumbnailUrl) throw new Error("upload_failed");
      setThumbs((prev) => ({ ...prev, [recording.id]: saved.thumbnailUrl }));
    } catch {
      failedRef.current.add(recording.id);
    } finally {
      inFlightRef.current.delete(recording.id);
    }
  }, []);

  // Only pay to decode a video for cards the member can actually see.
  useEffect(() => {
    const node = gridRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          const id = entry.target.getAttribute("data-recording-id");
          if (!id || thumbs[id]) continue;
          const recording = items.find((r) => r.id === id);
          if (recording && recording.status === "ready" && !recording.hasThumbnail) {
            requestThumbnail(recording);
          }
        }
      },
      { rootMargin: "250px" }
    );
    node.querySelectorAll("[data-thumb-target]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items, thumbs, requestThumbnail]);

  // Auto-refresh while anything is still pulling, so a processing card becomes
  // playable without a manual reload.
  const hasUnready = items.some((r) => r.status !== "ready");
  useEffect(() => {
    if (!hasUnready) return undefined;
    const timer = setInterval(() => {
      fetch("/api/recordings?include=all&limit=60", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (json?.ok && Array.isArray(json.data)) setItems(json.data);
        })
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [hasUnready]);

  // The Trash is permanent after the toast fades; auto-dismiss the Undo prompt.
  useEffect(() => {
    if (!undo) return undefined;
    const timer = setTimeout(() => setUndo(null), 12000);
    return () => clearTimeout(timer);
  }, [undo]);

  const active = items.find((r) => r.id === activeId) || null;
  const media = activeId ? playback[activeId] : null;

  // Distinct lounges for the filter dropdown, alphabetically.
  const lounges = useMemo(
    () => [...new Set(items.map((r) => r.roomName).filter(Boolean))].sort(),
    [items]
  );

  const ordered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const weekCut = now - WEEK_MS;
    const monthCut = now - MONTH_MS;
    const matched = items.filter((r) => {
      if (lounge !== "all" && r.roomName !== lounge) return false;
      const started = Date.parse(r.startedAt) || 0;
      if (chip === "week" && started < weekCut) return false;
      if (chip === "month" && started < monthCut) return false;
      if (chip === "vertical" && recordingOrientation(r.width, r.height) !== "vertical") return false;
      if (
        chip === "shared" &&
        !(Array.isArray(r.participants) &&
          r.participants.some((participant) => participant?.id === currentUserId))
      ) {
        return false;
      }
      if (needle) {
        const haystack = [r.title, r.roomName, ...(r.participants || []).map((p) => p?.name)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });

    // Processing/failed cards lead, then the chosen sort within each group.
    return matched.sort((a, b) => {
      const aReady = a.status === "ready" ? 1 : 0;
      const bReady = b.status === "ready" ? 1 : 0;
      if (aReady !== bReady) return aReady - bReady;
      switch (sort) {
        case "oldest":
          return (Date.parse(a.startedAt) || Infinity) - (Date.parse(b.startedAt) || Infinity);
        case "longest":
          return (b.durationSec || 0) - (a.durationSec || 0);
        case "largest":
          return (b.sizeBytes || 0) - (a.sizeBytes || 0);
        default:
          return (Date.parse(b.startedAt) || 0) - (Date.parse(a.startedAt) || 0);
      }
    });
  }, [items, lounge, chip, query, sort, now, currentUserId]);

  const filtersActive = Boolean(query.trim()) || lounge !== "all" || chip !== "all";

  if (loadError) {
    return (
      <div>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.error}>{t("loadFailed")}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className={styles.title}>{t("title")}</h1>
      <p className={styles.subtitle}>{t("subtitle")}</p>

      {storage && (
        <div className={styles.storage}>
          <div className={styles.storageBar}>
            <span
              className={`${styles.storageFill} ${storage.warning ? styles.storageFillWarn : ""}`}
              style={{ width: `${Math.min(100, Math.round(storage.ratio * 100))}%` }}
            />
          </div>
          <p className={styles.storageText}>
            {t("storageUsage", {
              used: formatBytes(storage.usedBytes),
              limit: formatBytes(storage.limitBytes),
            })}
            {storage.warning ? ` · ${t("storageWarning")}` : ""}
          </p>
        </div>
      )}

      {notice && (
        <p className={notice.type === "error" ? styles.error : styles.notice}>{notice.text}</p>
      )}

      {undo && (
        <div className={styles.undoToast} role="status">
          <span>{t("movedToTrash")}</span>
          <button type="button" className={styles.undoButton} onClick={undoDelete}>
            {t("undo")}
          </button>
        </div>
      )}

      {active && <RecordingPlayer recording={active} media={media} onClose={() => setActiveId(null)} />}

      {trashOpen ? (
        <div className={styles.trashPanel}>
          <div className={styles.trashHead}>
            <h2 className={styles.trashTitle}>{t("trashTitle")}</h2>
            <button
              type="button"
              className={styles.clearButton}
              onClick={() => setTrashOpen(false)}
            >
              {t("backToLibrary")}
            </button>
          </div>
          <p className={styles.trashHint}>{t("trashHint")}</p>
          {trashLoading ? (
            <p className={styles.loading}>{t("loading")}</p>
          ) : deletedItems.length === 0 ? (
            <p className={styles.noResults}>{t("trashEmpty")}</p>
          ) : (
            <ul className={styles.trashList}>
              {deletedItems.map((recording) => (
                <li key={recording.id} className={styles.trashRow}>
                  <span className={styles.trashName}>{recording.title}</span>
                  <span className={styles.trashMeta}>
                    {formatRecordingDate(recording.startedAt)}
                  </span>
                  <button
                    type="button"
                    className={styles.playButton}
                    onClick={() => restoreTrashed(recording)}
                  >
                    {t("restore")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{t("empty")}</p>
          <p className={styles.emptyHint}>{t("emptyHint")}</p>
          <Link className={styles.emptyLink} href="/calendar">
            {t("browseCalendar")}
          </Link>
        </div>
      ) : (
        <>
          <div className={styles.toolbar}>
            <label className={styles.searchField}>
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                className={styles.searchInput}
                placeholder={t("searchPlaceholder")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label={t("searchPlaceholder")}
              />
            </label>
            <select
              className={styles.select}
              value={lounge}
              onChange={(event) => setLounge(event.target.value)}
              aria-label={t("allLounges")}
            >
              <option value="all">{t("allLounges")}</option>
              {lounges.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <select
              className={styles.select}
              value={sort}
              onChange={(event) => updateRecordingView({ sort: event.target.value })}
              aria-label={t("sortLabel")}
            >
              <option value="newest">{t("sortNewest")}</option>
              <option value="oldest">{t("sortOldest")}</option>
              <option value="longest">{t("sortLongest")}</option>
              <option value="largest">{t("sortLargest")}</option>
            </select>
            <div className={styles.viewToggle} role="group" aria-label={t("viewLabel")}>
              <button
                type="button"
                className={view === "grid" ? styles.viewButtonActive : styles.viewButton}
                onClick={() => updateRecordingView({ view: "grid" })}
                aria-pressed={view === "grid"}
                aria-label={t("viewGrid")}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                type="button"
                className={view === "list" ? styles.viewButtonActive : styles.viewButton}
                onClick={() => updateRecordingView({ view: "list" })}
                aria-pressed={view === "list"}
                aria-label={t("viewList")}
              >
                <List size={16} />
              </button>
            </div>
            {canDelete && (
              <button type="button" className={styles.trashButton} onClick={openTrash}>
                {t("trash")}
              </button>
            )}
          </div>

          <div className={styles.chips} role="group" aria-label={t("filtersLabel")}>
            {[
              ["all", t("chipAll")],
              ["week", t("chipWeek")],
              ["month", t("chipMonth")],
              ["vertical", t("chipVertical")],
              ["shared", t("chipShared")],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`${styles.chip} ${chip === value ? styles.chipActive : ""}`}
                onClick={() => updateRecordingView({ chip: value })}
                aria-pressed={chip === value}
              >
                {label}
              </button>
            ))}
            {filtersActive && (
              <button
                type="button"
                className={styles.clearButton}
                onClick={() => {
                  setQuery("");
                  setLounge("all");
                  updateRecordingView({ chip: "all" });
                }}
              >
                {t("clearFilters")}
              </button>
            )}
          </div>

          {ordered.length === 0 ? (
            <p className={styles.noResults}>{t("noResults")}</p>
          ) : (
            <ul
              className={`${styles.grid} ${view === "list" ? styles.list : ""}`}
              ref={gridRef}
            >
          {ordered.map((recording) => {
            if (recording.status !== "ready") {
              const failed = recording.status === "failed";
              return (
                <li key={recording.id} className={styles.card}>
                  <div className={styles.pipelineThumb}>
                    {failed ? (
                      <AlertTriangle size={24} aria-hidden="true" />
                    ) : (
                      <span className={styles.progressTrack} aria-hidden="true">
                        <span className={styles.progressFill} />
                      </span>
                    )}
                  </div>
                  <div className={styles.cardBody}>
                    <h2 className={styles.cardTitle}>{recording.title}</h2>
                    <p className={styles.cardMeta}>{failed ? t("failed") : t("processing")}</p>
                    {failed && canDelete && (
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.playButton}
                          onClick={() => retry(recording)}
                          disabled={retryingId === recording.id}
                        >
                          {retryingId === recording.id ? t("retrying") : t("retry")}
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            }

            // A missing length/duration is normal: JaaS omits them for some
            // sessions, and "0:00" would read as a broken recording.
            const duration = recording.durationSec ? formatDuration(recording.durationSec) : null;
            const size = formatBytes(recording.sizeBytes);
            const date = formatRecordingDate(recording.startedAt);
            const time = formatRecordingTime(recording.startedAt);
            const when = [date, time].filter(Boolean).join(" · ");
            // Drop the lounge from the metadata row when the title already
            // names it (the default title does), per the library spec.
            const lounge =
              recording.roomName && !String(recording.title || "").includes(recording.roomName)
                ? recording.roomName
                : null;
            const meta = [when, size, lounge].filter(Boolean).join(" · ");
            const vertical = recordingOrientation(recording.width, recording.height) === "vertical";
            const fresh = isNewRecording(recording.startedAt);
            const thumb = thumbs[recording.id] || null;

            return (
              <li key={recording.id} className={`${styles.card} ${vertical ? styles.cardVertical : ""}`}>
                <button
                  type="button"
                  className={styles.thumb}
                  data-thumb-target={thumb ? undefined : ""}
                  data-recording-id={recording.id}
                  onClick={() => play(recording)}
                  aria-label={`${t("play")}: ${recording.title}`}
                >
                  {thumb ? (
                    // Poster frame captured by a member; the title carries the
                    // spoken content, so the image stays decorative.
                    <img src={thumb} alt="" className={styles.thumbImg} loading="lazy" />
                  ) : (
                    <span className={styles.thumbPlaceholder} aria-hidden="true">
                      <Film size={26} />
                    </span>
                  )}
                  {duration && <span className={styles.durationBadge}>{duration}</span>}
                  {fresh && <span className={styles.newBadge}>{t("newBadge")}</span>}
                  <span className={styles.playOverlay} aria-hidden="true">
                    <Play size={20} />
                  </span>
                </button>

                <div className={styles.cardBody}>
                  <h2 className={styles.cardTitle}>{recording.title}</h2>
                  <p className={styles.cardMeta}>{meta}</p>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.playButton}
                      onClick={() => play(recording)}
                      aria-expanded={activeId === recording.id}
                    >
                      {activeId === recording.id ? t("hide") : t("play")}
                    </button>
                    <button
                      type="button"
                      className={styles.shareButton}
                      onClick={() => copyLink(recording)}
                    >
                      {t("share")}
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => remove(recording)}
                        disabled={busyId === recording.id}
                      >
                        {busyId === recording.id ? t("deleting") : t("delete")}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
            </ul>
          )}
        </>
      )}

      {canDelete && !trashOpen && items.length > 0 && (
        <p className={styles.footnote}>{t("ownerNote")}</p>
      )}
    </div>
  );
}
