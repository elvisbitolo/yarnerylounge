// Browser-only helper: grab a poster frame from a video URL.
//
// The library calls this for a recording that has no stored thumbnail yet. It
// loads the signed video off-screen, seeks ~3s in, draws that frame to a
// canvas and returns a JPEG data URL for the upload route. Kept out of the
// component so the capture policy (timeout, seek target, output size) is in
// one place.

import { computeThumbnailSize } from "./recordings-display";

// Where in the file to sample. 3s avoids the black/fade-in at the start; a
// short recording falls back to a quarter of its length.
export const THUMBNAIL_AT_SEC = 3;
const LOAD_TIMEOUT_MS = 20000;

/**
 * Capture one frame. Resolves `{ dataUrl, width, height }`; rejects with a
 * short code the caller can log without surfacing to the member.
 */
export function captureVideoFrame(url, { atSec = THUMBNAIL_AT_SEC } = {}) {
  return new Promise((resolve, reject) => {
    if (!url || typeof document === "undefined") {
      reject(new Error("thumbnail_unavailable"));
      return;
    }

    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    let settled = false;
    const timer = setTimeout(() => finish(new Error("thumbnail_timeout")), LOAD_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        /* detaching a broken element is best-effort */
      }
    }

    function finish(error, value) {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(value);
    }

    video.onerror = () => finish(new Error("thumbnail_load_failed"));

    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const target = duration > 0 ? Math.min(atSec, Math.max(0.1, duration * 0.25)) : 0;
      try {
        video.currentTime = target;
      } catch {
        finish(new Error("thumbnail_seek_failed"));
      }
    };

    video.onseeked = () => {
      try {
        const size = computeThumbnailSize(video.videoWidth, video.videoHeight);
        const canvas = document.createElement("canvas");
        canvas.width = size.width;
        canvas.height = size.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          finish(new Error("thumbnail_capture_failed"));
          return;
        }
        ctx.drawImage(video, 0, 0, size.width, size.height);
        finish(null, {
          dataUrl: canvas.toDataURL("image/jpeg", 0.72),
          width: video.videoWidth,
          height: video.videoHeight,
        });
      } catch {
        // A cross-origin frame without CORS taints the canvas and throws here.
        finish(new Error("thumbnail_capture_failed"));
      }
    };

    video.src = url;
  });
}
