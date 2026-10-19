"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Volume2, Volume1, VolumeX, SlidersHorizontal } from "lucide-react";
import useDraggableFloat from "@/lib/use-draggable-float";

function generateAmbientPad() {
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
  return new Blob([bytes], { type: "audio/wav" });
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
  // A lounge whose backdrop is a video stays silent until someone asks for
  // music: auto-playing both would fight each other. The room header's music
  // button (or the player pill) flips this, after which the ambient pad fills
  // in whenever the room has no uploaded track configured.
  const [manualStart, setManualStart] = useState(false);

  const musicDrag = useDraggableFloat({
    storageKey: "yarnerylounge-music-pos",
    defaultPos: { left: 24, bottom: 24 },
    width: 150,
    height: 48,
    minBottom: 20,
    anchor: "left",
  });

  const audioRef = useRef(null);
  const prevSrcRef = useRef("");
  const fadeTimerRef = useRef(null);
  const autoPausedRef = useRef(false);
  const volumeRef = useRef(volume);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  // The generated pad is served to the <audio> element as a blob: object URL.
  // A data: URL would be refused by the app's Content-Security-Policy
  // (media-src is 'self' blob: and the storage host), which silently made the
  // music control do nothing -- play() rejects on the blocked source.
  const [ambientWav, setAmbientWav] = useState("");
  useEffect(() => {
    if (!active) return undefined;
    const url = URL.createObjectURL(generateAmbientPad());
    setAmbientWav(url);
    return () => URL.revokeObjectURL(url);
  }, [active]);

  const baseSrc = useMemo(() => {
    if (!active) return "";
    if (musicPlaying && musicFileId) return `/api/rooms/music/stream?id=${musicFileId}`;
    if (musicPlaying && musicUrl) return musicUrl;
    if (hasVideoBackdrop && !manualStart) return "";
    return ambientWav;
  }, [active, musicPlaying, musicFileId, musicUrl, hasVideoBackdrop, ambientWav, manualStart]);

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
    // No source means the element unmounted; the browser fires no pause event
    // for that, so the reported state has to be retracted here or the header
    // button keeps claiming music is playing.
    if (!src) {
      setPlaying(false);
      return;
    }
    if (!audio) return;

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
    if (audio && !audio.paused) {
      audio.pause();
      // Releasing the override collapses the source back to silence in rooms
      // whose backdrop is a video, so a stop really is a stop.
      setManualStart(false);
      setPlaying(false);
      return;
    }
    setManualStart(true);
    if (audio) {
      audio.volume = volumeRef.current;
      audio.play().catch(() => {});
    }
  }

  // With a video backdrop and no uploaded track there is no <audio> element
  // until someone asks for music, so the intent has to outlive the press: when
  // the source appears, honour it.
  useEffect(() => {
    if (!manualStart || !src) return;
    const audio = audioRef.current;
    if (!audio || !audio.paused) return;
    audio.volume = volumeRef.current;
    audio.play().catch(() => {});
  }, [manualStart, src]);

  // The room header owns no audio element of its own; it dispatches these
  // window events so this component stays the single owner of playback. The
  // state event keeps the header button in sync with the floating pill.
  useEffect(() => {
    function stop() {
      const audio = audioRef.current;
      if (audio && !audio.paused) audio.pause();
      setManualStart(false);
      setPlaying(false);
    }
    function start() {
      const audio = audioRef.current;
      setManualStart(true);
      if (audio && audio.paused) {
        audio.volume = volumeRef.current;
        audio.play().catch(() => {});
      }
    }
    function onCommand(event) {
      const want = event?.detail?.playing;
      if (want === true) return start();
      if (want === false) return stop();
      const audio = audioRef.current;
      return audio && !audio.paused ? stop() : start();
    }
    window.addEventListener("speakeasy-music-command", onCommand);
    return () => window.removeEventListener("speakeasy-music-command", onCommand);
  }, []);

  useEffect(() => {
    // Publishing on mount matters: the room header may attach its listener
    // after this component's effects have already run, so it also asks for a
    // fresh snapshot with the query event.
    function publish() {
      window.dispatchEvent(
        new CustomEvent("speakeasy-music-state", {
          detail: { playing, available: Boolean(src) },
        })
      );
    }
    publish();
    window.addEventListener("speakeasy-music-query", publish);
    return () => window.removeEventListener("speakeasy-music-query", publish);
  }, [playing, src]);

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
        <div {...musicDrag.handlers} style={{ ...musicDrag.style, ...{
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "grab",
          userSelect: "none",
        } }}>
          {/* Main toggle pill */}
          <button
            type="button"
            onClick={() => {
              if (musicDrag.wasDragged()) return;
              toggle();
            }}
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
            onClick={() => {
              if (musicDrag.wasDragged()) return;
              setShowSlider((v) => !v);
            }}
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
