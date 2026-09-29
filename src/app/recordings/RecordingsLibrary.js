"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { formatBytes, formatDuration, formatRecordingDate } from "@/lib/recordings-display";
import styles from "./recordings.module.css";

export default function RecordingsLibrary({ recordings, loadError, canDelete }) {
  const t = useTranslations("recordings");
  const router = useRouter();
  const [activeId, setActiveId] = useState(null);
  const [playback, setPlayback] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);

  async function play(recording) {
    if (activeId === recording.id) {
      setActiveId(null);
      return;
    }
    setActiveId(recording.id);
    setPlayback((prev) => ({ ...prev, [recording.id]: null }));
    setNotice(null);
    try {
      const res = await fetch(`/api/recordings/${recording.id}/play`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || t("playbackFailed"));
      setPlayback((prev) => ({ ...prev, [recording.id]: json }));
    } catch (error) {
      setPlayback((prev) => ({ ...prev, [recording.id]: { error: error?.message || t("playbackFailed") } }));
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
      setNotice({ type: "ok", text: t("deleted") });
      // Re-fetch from the server so the card disappears along with the file.
      router.refresh();
    } catch (error) {
      setNotice({ type: "error", text: error?.message || t("deleteFailed") });
    } finally {
      setBusyId(null);
    }
  }

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

      {notice && (
        <p className={notice.type === "error" ? styles.error : styles.notice}>{notice.text}</p>
      )}

      {recordings.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{t("empty")}</p>
          <p className={styles.emptyHint}>{t("emptyHint")}</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {recordings.map((recording) => {
            const isOpen = activeId === recording.id;
            const media = playback[recording.id];
            // A missing length/duration is normal: JaaS omits them for some
            // sessions, and "0:00" would read as a broken recording.
            const duration = recording.durationSec ? formatDuration(recording.durationSec) : null;
            const size = formatBytes(recording.sizeBytes);
            const date = formatRecordingDate(recording.startedAt);

            return (
              <li key={recording.id} className={styles.card}>
                <div className={styles.meta}>
                  <h2 className={styles.cardTitle}>{recording.title}</h2>
                  <p className={styles.cardMeta}>
                    {[date, duration, size, recording.roomName].filter(Boolean).join(" \u00b7 ")}
                  </p>

                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.playButton}
                      onClick={() => play(recording)}
                      aria-expanded={isOpen}
                    >
                      {t("play")}
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

                {isOpen && (
                  <div className={styles.player}>
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
                      <p className={styles.loading}>Loading&hellip;</p>
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
                  </div>
                )}
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
