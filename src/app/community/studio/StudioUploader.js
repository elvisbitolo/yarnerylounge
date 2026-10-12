"use client";

import { useRef, useState } from "react";
import { UploadCloud, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import styles from "./studio.module.css";

const STUDIO_BUCKET = "recordings";
const MAX_VIDEO_BYTES = 2 * 1024 ** 3;
const MAX_POSTER_BYTES = 5 * 1024 ** 2;
const VIDEO_TYPES = ["video/mp4", "video/webm"];
const POSTER_TYPES = ["image/jpeg", "image/png", "image/webp"];

function readVideoMeta(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.muted = true;
    const finish = (meta) => {
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    probe.onloadedmetadata = () =>
      finish({
        durationSec: Number.isFinite(probe.duration) ? Math.round(probe.duration) : null,
        width: probe.videoWidth || null,
        height: probe.videoHeight || null,
      });
    probe.onerror = () => finish({ durationSec: null, width: null, height: null });
    probe.src = url;
  });
}

export default function StudioUploader({ onClose, onDone }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;

    const videoFile = event.currentTarget.video.files?.[0];
    const posterFile = event.currentTarget.poster.files?.[0];

    if (!videoFile) return setError("Choose a video file");
    if (!VIDEO_TYPES.includes(videoFile.type)) return setError("Upload an MP4 or WebM video");
    if (videoFile.size > MAX_VIDEO_BYTES) return setError("Video too large (max 2 GB)");
    if (!posterFile) return setError("Choose a cover image");
    if (posterFile.type && !POSTER_TYPES.includes(posterFile.type)) {
      return setError("Cover must be a JPG, PNG or WebP image");
    }
    if (posterFile.size > MAX_POSTER_BYTES) return setError("Cover image too large (max 5 MB)");

    setError("");
    setBusy(true);
    try {
      setNote("Reading video…");
      const meta = await readVideoMeta(videoFile);

      setNote("Preparing upload…");
      const initRes = await fetch("/api/studio/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "init",
          video: { name: videoFile.name, type: videoFile.type, size: videoFile.size },
          poster: { type: posterFile.type || "image/jpeg", size: posterFile.size },
        }),
      });
      const init = await initRes.json().catch(() => ({}));
      if (!initRes.ok) throw new Error(init.error || "Could not start the upload");

      setNote("Uploading video…");
      const videoUpload = await supabase.storage
        .from(STUDIO_BUCKET)
        .uploadToSignedUrl(init.videoUpload.path, init.videoUpload.token, videoFile, {
          contentType: videoFile.type,
        });
      if (videoUpload.error) throw new Error(videoUpload.error.message || "Video upload failed");

      setNote("Uploading cover…");
      const posterUpload = await supabase.storage
        .from(STUDIO_BUCKET)
        .uploadToSignedUrl(init.posterUpload.path, init.posterUpload.token, posterFile, {
          contentType: posterFile.type || "image/jpeg",
        });
      if (posterUpload.error) throw new Error(posterUpload.error.message || "Cover upload failed");

      setNote("Publishing…");
      const finalRes = await fetch("/api/studio/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finalize",
          id: init.id,
          title,
          description,
          durationSec: meta.durationSec,
          width: meta.width,
          height: meta.height,
          sizeBytes: videoFile.size,
        }),
      });
      const final = await finalRes.json().catch(() => ({}));
      if (!finalRes.ok) throw new Error(final.error || "Could not publish the video");

      onDone?.();
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setBusy(false);
      setNote("");
    }
  }

  return (
    <section className={styles.uploader} aria-label="Upload a Studio video">
      <div className={styles.uploaderHead}>
        <h2 className={styles.uploaderTitle}>Publish a video</h2>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close" disabled={busy}>
          <X size={18} />
        </button>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field}>
          <span className={styles.label}>Title</span>
          <input
            className={styles.input}
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={140}
            placeholder="e.g. Beginner lace: reading a chart"
            required
            disabled={busy}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Description</span>
          <textarea
            className={styles.textarea}
            name="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="What will members learn or see?"
            disabled={busy}
          />
        </label>

        <div className={styles.fileRow}>
          <label className={styles.field}>
            <span className={styles.label}>Video (MP4 or WebM)</span>
            <input className={styles.file} type="file" name="video" accept="video/mp4,video/webm" required disabled={busy} />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Cover image (JPG/PNG/WebP)</span>
            <input className={styles.file} type="file" name="poster" accept="image/jpeg,image/png,image/webp" required disabled={busy} />
          </label>
        </div>

        {error && <p className={styles.error}>{error}</p>}
        {note && <p className={styles.loading}>{note}</p>}

        <div className={styles.formActions}>
          <button type="button" className={styles.ghostBtn} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className={styles.primaryBtn} disabled={busy}>
            <UploadCloud size={16} /> {busy ? "Uploading…" : "Publish"}
          </button>
        </div>
      </form>
    </section>
  );
}
