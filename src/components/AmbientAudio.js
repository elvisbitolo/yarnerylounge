"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Volume2, Volume1, VolumeX, SlidersHorizontal } from "lucide-react";

function generateAmbientWav() {
  const sampleRate = 22050;
  const duration = 8;
  const numSamples = sampleRate * duration;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeStr(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const freqs = [130.81, 164.81, 196.0, 261.63, 329.63];
  const amps = [0.15, 0.12, 0.10, 0.08, 0.06];
  const phases = freqs.map(() => Math.random() * Math.PI * 2);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;
    for (let f = 0; f < freqs.length; f++) {
      const env = 0.3 + 0.7 * Math.sin(2 * Math.PI * (0.03 + f * 0.008) * t + phases[f]);
      sample += amps[f] * env * Math.sin(2 * Math.PI * freqs[f] * t + Math.sin(2 * Math.PI * 0.1 * t) * 2);
    }
    const fadeLen = sampleRate * 2;
    let fade = 1;
    if (i < fadeLen) fade = i / fadeLen;
    else if (i > numSamples - fadeLen) fade = (numSamples - i) / fadeLen;
    const val = Math.max(-1, Math.min(1, sample * fade));
    view.setInt16(44 + i * 2, val * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return "data:audio/wav;base64," + btoa(binary);
}

export default function AmbientAudio({
  active,
  musicUrl,
  musicPlaying,
  musicFileId,
  hasVideoBackdrop,
  pauseWhenBusy = false,
}) {
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(() => {
    if (typeof window === "undefined") return 0.7;
    const saved = localStorage.getItem("speakeasy_master_volume");
    return saved !== null ? Math.max(0, Math.min(1, parseFloat(saved) || 0.7)) : 0.7;
  });
  const [continuousPlay, setContinuousPlay] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("speakeasy_continuous_music") === "true";
  });
  const [showSlider, setShowSlider] = useState(false);

  const audioRef = useRef(null);
  const prevSrcRef = useRef("");
  const fadeTimerRef = useRef(null);
  const autoPausedRef = useRef(false);
  const volumeRef = useRef(volume);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  const ambientWav = useMemo(() => (active ? generateAmbientWav() : ""), [active]);

  const baseSrc = useMemo(() => {
    if (!active) return "";
    if (musicPlaying && musicFileId) return `/api/rooms/music/stream?id=${musicFileId}`;
    if (musicPlaying && musicUrl) return musicUrl;
    if (hasVideoBackdrop) return "";
    return ambientWav;
  }, [active, musicPlaying, musicFileId, musicUrl, hasVideoBackdrop, ambientWav]);

  const src = baseSrc;

  // Update HTML audio element volume whenever state changes
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;

    audio.volume = volumeRef.current;

    if (prevSrcRef.current && prevSrcRef.current !== src && audio.duration > 0) {
      if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
      let vol = audio.volume;
      fadeTimerRef.current = setInterval(() => {
        vol -= 0.05;
        if (vol <= 0) {
          clearInterval(fadeTimerRef.current);
          audio.volume = 0;
          audio.src = src;
          audio.load();
          audio
            .play()
            .then(() => {
              let fadeVol = 0;
              const targetVol = volumeRef.current;
              const fadeInterval = setInterval(() => {
                fadeVol += 0.05;
                if (fadeVol >= targetVol) {
                  clearInterval(fadeInterval);
                  audio.volume = targetVol;
                } else {
                  audio.volume = fadeVol;
                }
              }, 50);
            })
            .catch(() => {});
        } else {
          audio.volume = Math.max(0, vol);
        }
      }, 50);
    } else {
      audio.src = src;
      audio.load();
      audio
        .play()
        .then(() => {
          setPlaying(true);
          audio.volume = volumeRef.current;
        })
        .catch(() => {});
    }

    prevSrcRef.current = src;
  }, [src]);

  // Handle room occupancy ducking / continuous stream
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const shouldDuck = pauseWhenBusy && !continuousPlay;
    if (shouldDuck) {
      if (!audio.paused) autoPausedRef.current = true;
      audio.pause();
    } else if (autoPausedRef.current) {
      autoPausedRef.current = false;
      if (src) audio.play().catch(() => {});
    }
  }, [pauseWhenBusy, continuousPlay, src]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
      if (audio) {
        audio.pause();
        audio.src = "";
      }
    };
  }, []);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.volume = volumeRef.current;
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }

  function handleVolumeChange(e) {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (typeof window !== "undefined") {
      localStorage.setItem("speakeasy_master_volume", String(newVol));
    }
    const audio = audioRef.current;
    if (audio) {
      audio.volume = newVol;
      if (newVol > 0 && audio.paused) {
        audio.play().catch(() => {});
      }
    }
  }

  function handleContinuousToggle() {
    setContinuousPlay((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("speakeasy_continuous_music", String(next));
      }
      return next;
    });
  }

  if (!active) return null;

  const currentVolumePercent = Math.round(volume * 100);
  const VolumeIcon = !playing || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <>
      {src && (
        <audio
          ref={audioRef}
          src={src}
          loop
          preload="auto"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
      )}

      {src && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: 24,
            zIndex: 999,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {/* Main toggle pill */}
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? `Mute stream (${currentVolumePercent}%)` : "Play stream"}
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              border: playing ? "1px solid rgba(167,139,250,0.4)" : "1px solid rgba(255,255,255,0.15)",
              background: playing
                ? "linear-gradient(135deg, rgba(109,93,246,0.85), rgba(167,139,250,0.75))"
                : "rgba(30,30,38,0.9)",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: playing
                ? "0 4px 20px rgba(109,93,246,0.4)"
                : "0 2px 12px rgba(0,0,0,0.4)",
              transition: "all 0.2s ease",
              backdropFilter: "blur(8px)",
            }}
          >
            <VolumeIcon size={20} />
          </button>

          {/* Slider trigger */}
          <button
            type="button"
            onClick={() => setShowSlider((v) => !v)}
            aria-label="Adjust master volume slider"
            title="Master volume controls"
            style={{
              height: 38,
              padding: "0 12px",
              borderRadius: 12,
              border: showSlider ? "1px solid rgba(167,139,250,0.6)" : "1px solid rgba(255,255,255,0.15)",
              background: showSlider ? "rgba(45,35,70,0.95)" : "rgba(30,30,38,0.88)",
              color: "#e2e8f0",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
              backdropFilter: "blur(8px)",
            }}
          >
            <SlidersHorizontal size={14} />
            <span>{currentVolumePercent}%</span>
          </button>

          {/* Master Volume Slider Popover Panel */}
          {showSlider && (
            <div
              role="region"
              aria-label="Master audio controls"
              style={{
                position: "absolute",
                bottom: 58,
                left: 0,
                background: "rgba(22, 22, 30, 0.95)",
                border: "1px solid rgba(255, 255, 255, 0.14)",
                borderRadius: 14,
                padding: "14px 16px",
                width: 240,
                boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
                backdropFilter: "blur(12px)",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                color: "#fff",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: "#a5b4fc" }}>
                  Master Volume
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>
                  {currentVolumePercent}%
                </span>
              </div>

              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={handleVolumeChange}
                aria-label="Master volume slider"
                style={{
                  width: "100%",
                  accentColor: "#818cf8",
                  cursor: "pointer",
                }}
              />

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11.5,
                  color: "#cbd5e1",
                  cursor: "pointer",
                  marginTop: 2,
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={continuousPlay}
                  onChange={handleContinuousToggle}
                  style={{ accentColor: "#818cf8", cursor: "pointer" }}
                />
                <span>Stream 24/7 (don&apos;t pause when others talk)</span>
              </label>
            </div>
          )}
        </div>
      )}
    </>
  );
}
