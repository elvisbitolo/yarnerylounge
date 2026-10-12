"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Plus, Trash2, X } from "lucide-react";
import StudioUploader from "./StudioUploader";
import styles from "./studio.module.css";

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const mm = hours ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(secs).padStart(2, "0");
  return hours ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Fixed locale + UTC so the server and client render the same string.
function formatDate(iso) {
  if (!iso) return "";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function StudioLibrary({ videos, loadError, canUpload, currentUserLabel }) {
  const router = useRouter();
  const [active, setActive] = useState(null);
  const [playback, setPlayback] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const openPlayer = useCallback(async (video) => {
    setActive(video);
    setPlayback({ loading: true });
    try {
      const res = await fetch(`/api/studio/videos/${video.id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load the video");
      setPlayback({ url: data.url });
    } catch (error) {
      setPlayback({ error: error.message || "Could not load the video" });
    }
  }, []);

  const closePlayer = useCallback(() => {
    setActive(null);
    setPlayback(null);
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    function onKey(event) {
      if (event.key === "Escape") closePlayer();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, closePlayer]);

  async function handleDelete(video) {
    if (!window.confirm(`Delete “${video.title}”? This cannot be undone.`)) return;
    setDeletingId(video.id);
    try {
      const res = await fetch(`/api/studio/videos/${video.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Delete failed");
      }
      if (active?.id === video.id) closePlayer();
      router.refresh();
    } catch (error) {
      window.alert(error.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div className={styles.toolbar}>
        <p className={styles.count}>
          {videos.length} {videos.length === 1 ? "video" : "videos"}
        </p>
        {canUpload && (
          <button type="button" className={styles.primaryBtn} onClick={() => setUploadOpen(true)}>
            <Plus size={16} /> New video
          </button>
        )}
      </div>

      {uploadOpen && (
        <StudioUploader
          currentUserLabel={currentUserLabel}
          onClose={() => setUploadOpen(false)}
          onDone={() => {
            setUploadOpen(false);
            router.refresh();
          }}
        />
      )}

      {loadError && <p className={styles.error}>{loadError}</p>}

      {!loadError && videos.length === 0 && (
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>The studio is quiet</h2>
          <p className={styles.emptyText}>
            New talks, tutorials and stitch-alongs will appear here as soon as they are published.
          </p>
          {canUpload && (
            <button type="button" className={styles.primaryBtn} onClick={() => setUploadOpen(true)}>
              <Plus size={16} /> Publish the first video
            </button>
          )}
        </div>
      )}

      {videos.length > 0 && (
        <div className={styles.grid}>
          {videos.map((video) => {
            const ratio = video.width && video.height ? `${video.width} / ${video.height}` : undefined;
            return (
              <article key={video.id} className={styles.card}>
                <button
                  type="button"
                  className={styles.thumb}
                  style={{ aspectRatio: ratio }}
                  onClick={() => openPlayer(video)}
                  aria-label={`Play ${video.title}`}
                >
                  <span
                    className={styles.cover}
                    style={video.posterUrl ? { backgroundImage: `url("${video.posterUrl}")` } : undefined}
                    aria-hidden="true"
                  />
                  <span className={styles.playBadge} aria-hidden="true">
                    <Play size={22} />
                  </span>
                  {video.durationSec ? (
                    <span className={styles.duration}>{formatDuration(video.durationSec)}</span>
                  ) : null}
                </button>
                <div className={styles.cardBody}>
                  <h3 className={styles.cardTitle}>{video.title}</h3>
                  {video.description ? <p className={styles.cardDesc}>{video.description}</p> : null}
                  <p className={styles.cardMeta}>
                    {video.createdBy || "Studio"}
                    {video.createdAt ? ` · ${formatDate(video.createdAt)}` : ""}
                  </p>
                </div>
                {canUpload && (
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={() => handleDelete(video)}
                    disabled={deletingId === video.id}
                    aria-label={`Delete ${video.title}`}
                    title="Delete video"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}

      {active && (
        <div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-label={active.title}
          onClick={closePlayer}
        >
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHead}>
              <h2 className={styles.modalTitle}>{active.title}</h2>
              <button type="button" className={styles.closeBtn} onClick={closePlayer} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            {active.description ? <p className={styles.modalDesc}>{active.description}</p> : null}
            {playback?.url ? (
              <video className={styles.video} src={playback.url} controls autoPlay playsInline />
            ) : playback?.error ? (
              <p className={styles.error}>{playback.error}</p>
            ) : (
              <p className={styles.loading}>Loading…</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
