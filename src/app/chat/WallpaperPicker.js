"use client";

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { CHAT_WALLPAPERS, MAX_CUSTOM_WALLPAPER } from "@/lib/chat-appearance-core";
import styles from "./chat.module.css";

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Couldn't read that image"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image"));
    img.src = src;
  });
}

// Downscales/compresses a chosen image so the wallpaper stays small enough to
// live inside the user's extra JSON. Keeps files that already fit untouched.
async function prepareWallpaper(file) {
  const raw = await readFileAsDataUrl(file);
  if (raw.length <= MAX_CUSTOM_WALLPAPER) return raw;
  const img = await loadImage(raw);
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process that image");
  ctx.drawImage(img, 0, 0, width, height);
  let quality = 0.8;
  let out = canvas.toDataURL("image/jpeg", quality);
  while (out.length > MAX_CUSTOM_WALLPAPER && quality > 0.4) {
    quality -= 0.1;
    out = canvas.toDataURL("image/jpeg", quality);
  }
  if (out.length > MAX_CUSTOM_WALLPAPER) {
    throw new Error("That image is still too big — try a smaller file.");
  }
  return out;
}

// The WhatsApp-style wallpaper swatch grid, shared by the global Chat settings
// drawer (with upload) and the per-chat override in chat info.
export default function WallpaperPicker({
  value = "default",
  onPick = () => {},
  onUpload = null,
  customUrl = "",
  showUpload = false,
}) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (file) e.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      setError("Choose a PNG, JPEG or WebP image.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const dataUrl = await prepareWallpaper(file);
      if (onUpload) await onUpload(dataUrl);
    } catch (err) {
      setError(err.message || "Couldn't use that image.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className={styles.wallpaperGrid} role="radiogroup" aria-label="Chat wallpaper">
        <button
          type="button"
          role="radio"
          aria-checked={value === "default"}
          className={`${styles.wallpaperTile} ${styles.wallpaperTileLabel} ${
            value === "default" ? styles.wallpaperTileActive : ""
          }`}
          onClick={() => onPick("default")}
        >
          <span className={styles.wallpaperChip} aria-hidden="true" />
          <span className={styles.wallpaperTileText}>Default</span>
        </button>
        {CHAT_WALLPAPERS.map((wallpaper) => (
          <button
            key={wallpaper.id}
            type="button"
            role="radio"
            aria-checked={value === wallpaper.id}
            aria-label={wallpaper.label}
            title={wallpaper.label}
            className={`${styles.wallpaperTile} ${
              value === wallpaper.id ? styles.wallpaperTileActive : ""
            }`}
            onClick={() => onPick(wallpaper.id)}
          >
            <span className={styles.wallpaperChip} style={{ background: wallpaper.background }} aria-hidden="true" />
            <span className={styles.wallpaperTileText}>{wallpaper.label}</span>
          </button>
        ))}
        {customUrl && (
          <button
            type="button"
            role="radio"
            aria-checked={value === "custom"}
            aria-label="Your photo"
            title="Your photo"
            className={`${styles.wallpaperTile} ${
              value === "custom" ? styles.wallpaperTileActive : ""
            }`}
            onClick={() => onPick("custom")}
          >
            <span className={styles.wallpaperChip} style={{ background: `no-repeat center/cover url("${customUrl}")` }} aria-hidden="true" />
            <span className={styles.wallpaperTileText}>Photo</span>
          </button>
        )}
        {showUpload && (
          <button
            type="button"
            className={`${styles.wallpaperTile} ${styles.wallpaperTileLabel}`}
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label="Upload a wallpaper"
          >
            <span className={styles.wallpaperUploadChip}>
              {uploading ? "…" : <ImagePlus size={16} />}
            </span>
            <span className={styles.wallpaperTileText}>{uploading ? "Loading" : "Upload"}</span>
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: "none" }}
        onChange={handleFile}
      />
      {error && <p className={styles.settingsNote}>{error}</p>}
    </div>
  );
}