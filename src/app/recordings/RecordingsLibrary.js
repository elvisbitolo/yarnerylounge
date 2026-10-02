"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Film, Play } from "lucide-react";
import {
  formatBytes,
  formatDuration,
  formatRecordingDate,
  formatRecordingTime,
  isNewRecording,
  recordingOrientation,
} from "@/lib/recordings-display";
import { captureVideoFrame } from "@/lib/recording-thumbnail";
import styles from "./recordings.module.css";

export default function RecordingsLibrary({ recordings, loadError, canDelete }) {
  const t = useTranslations("recordings");
  const router = useRouter();
  const [activeId, setActiveId] = useState(null);
  const [playback, setPlayback] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  // Poster frames already signed by the server, plus any captured this session.
  const [thumbs, setThumbs] = useState(() =>
    Object.fromEntries(
      recordings.filter((r) => r.thumbnailUrl).map((r) => [r.id, r.thumbnailUrl])
    )
  );

  const gridRef = useRef(null);
  const inFlightRef = useRef(new Set());
  const failedRef = useRef(new Set());

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

  async function remove(recording) {
    if (!window.confirm(t("deleteConfirm"))) return;
    setBusyId(recording.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/recordings/${recording.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || t("deleteFailed"));
      setNotice({ type: "ok", text: t("deleted") });
      // Re-fetch from the server so the card disappears along with the file.
      router.refresh();
    } catch (error) {
      setNotice({ type: "error", text: error?.message || t("deleteFailed") });
    } finally {
      setBusyId(null);
    }
  }

  // Capture a poster frame for a recording that has none. Sequential by
  // construction: inFlightRef gates a second request for the same row, and a
  // failed row is never retried in the same session.
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
          const recording = recordings.find((r) => r.id === id);
          if (recording && !recording.hasThumbnail) requestThumbnail(recording);
        }
      },
      { rootMargin: "250px" }
    );
    node.querySelectorAll("[data-thumb-target]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [recordings, thumbs, requestThumbnail]);

  if (loadError) {
    return (
      <div>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.error}>{t("loadFailed")}</p>
      </div>
    );
  }

  const active = recordings.find((r) => r.id === activeId) || null;
  const media = activeId ? playback[activeId] : null;

  return (
    <div>
      <h1 className={styles.title}>{t("title")}</h1>
      <p className={styles.subtitle}>{t("subtitle")}</p>

      {notice && (
        <p className={notice.type === "error" ? styles.error : styles.notice}>{notice.text}</p>
      )}

      {active && (
        <section className={styles.playerPanel} aria-label={active.title}>
          <div className={styles.playerHead}>
            <h2 className={styles.playerTitle}>{active.title}</h2>
            <button
              type="button"
              className={styles.playerClose}
              onClick={() => setActiveId(null)}
              aria-label={t("hide")}
            >
              ×
            </button>
          </div>
          {media?.url ? (
            <video
              className={styles.video}
              src={media.url}
              controls
              autoPlay
              playsInline
              preload="metadata"
            />
          ) : media?.error ? (
            <p className={styles.error}>{t("unavailable")}</p>
          ) : (
            <p className={styles.loading}>{t("loading")}</p>
          )}
          {media?.transcriptUrl && (
            <a
              className={styles.transcriptLink}
              href={media.transcriptUrl}
              target="_blank"
              rel="noreferrer"
            >
              {t("transcript")}
            </a>
          )}
        </section>
      )}

      {recordings.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{t("empty")}</p>
          <p className={styles.emptyHint}>{t("emptyHint")}</p>
          <Link className={styles.emptyLink} href="/calendar">
            {t("browseCalendar")}
          </Link>
        </div>
      ) : (
        <ul className={styles.grid} ref={gridRef}>
          {recordings.map((recording) => {
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

      {canDelete && recordings.length > 0 && (
        <p className={styles.footnote}>{t("ownerNote")}</p>
      )}
    </div>
  );
}
