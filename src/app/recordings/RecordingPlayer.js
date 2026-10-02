"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Maximize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import styles from "./recordings.module.css";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const SEEK_STEP = 5;
// Do not resume within the last few seconds — the recording would instantly end.
const RESUME_MARGIN = 5;

export default function RecordingPlayer({ recording, media, onClose }) {
  const t = useTranslations("recordings");
  const stageRef = useRef(null);
  const videoRef = useRef(null);
  const lastSavedRef = useRef(-1);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const storageKey = `yarnery-recording-pos:${recording.id}`;

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const toggleFullscreen = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else stage.requestFullscreen?.().catch(() => {});
  }, []);

  // Keep the rate in sync when the member changes it mid-play.
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = speed;
  }, [speed]);

  function handleLoadedMetadata() {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = speed;
    const saved = Number(window.localStorage.getItem(storageKey));
    if (Number.isFinite(saved) && saved > 0 && v.duration && saved < v.duration - RESUME_MARGIN) {
      v.currentTime = saved;
    }
  }

  // Persist roughly every 5s of playback, not on every timeupdate event.
  function handleTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    const whole = Math.floor(v.currentTime);
    if (whole > 0 && whole % 5 === 0 && lastSavedRef.current !== whole) {
      lastSavedRef.current = whole;
      try {
        window.localStorage.setItem(storageKey, String(whole));
      } catch {
        /* private mode / quota: resume is a convenience, not required */
      }
    }
  }

  function handleKeyDown(event) {
    const v = videoRef.current;
    if (!v) return;
    switch (event.key) {
      case " ":
      case "Spacebar":
        event.preventDefault();
        togglePlay();
        break;
      case "ArrowRight":
        event.preventDefault();
        v.currentTime = Math.min(v.duration || 0, v.currentTime + SEEK_STEP);
        break;
      case "ArrowLeft":
        event.preventDefault();
        v.currentTime = Math.max(0, v.currentTime - SEEK_STEP);
        break;
      case "ArrowUp":
        event.preventDefault();
        v.volume = Math.min(1, Number((v.volume + 0.1).toFixed(2)));
        setMuted(v.volume === 0);
        break;
      case "ArrowDown":
        event.preventDefault();
        v.volume = Math.max(0, Number((v.volume - 0.1).toFixed(2)));
        setMuted(v.volume === 0);
        break;
      case "f":
      case "F":
        event.preventDefault();
        toggleFullscreen();
        break;
      default:
        break;
    }
  }

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }

  return (
    <section className={styles.playerPanel} aria-label={t("playerLabel")}>
      <div className={styles.playerHead}>
        <h2 className={styles.playerTitle}>{recording.title}</h2>
        <button
          type="button"
          className={styles.playerClose}
          onClick={onClose}
          aria-label={t("hide")}
        >
          ×
        </button>
      </div>

      {media?.url ? (
        <>
          <div
            className={styles.playerStage}
            ref={stageRef}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            role="group"
            aria-label={recording.title}
          >
            <video
              ref={videoRef}
              className={styles.video}
              src={media.url}
              controls
              autoPlay
              playsInline
              preload="metadata"
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onVolumeChange={() => setMuted(videoRef.current?.muted ?? false)}
            />
          </div>

          <div className={styles.playerControls}>
            <button
              type="button"
              className={styles.controlButton}
              onClick={togglePlay}
              aria-label={playing ? t("pause") : t("play")}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button
              type="button"
              className={styles.controlButton}
              onClick={toggleMute}
              aria-label={muted ? t("unmute") : t("mute")}
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <label className={styles.speedLabel}>
              {t("speed")}
              <select
                className={styles.speedSelect}
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
                aria-label={t("speed")}
              >
                {SPEEDS.map((value) => (
                  <option key={value} value={value}>
                    {value}x
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={styles.controlButton}
              onClick={toggleFullscreen}
              aria-label={t("fullscreen")}
            >
              <Maximize size={16} />
            </button>
            {media.downloadUrl && (
              <a className={styles.controlButton} href={media.downloadUrl} download>
                <Download size={16} /> {t("download")}
              </a>
            )}
            {media.transcriptUrl && (
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
        </>
      ) : media?.error ? (
        <p className={styles.error}>{t("unavailable")}</p>
      ) : (
        <p className={styles.loading}>{t("loading")}</p>
      )}
    </section>
  );
}
