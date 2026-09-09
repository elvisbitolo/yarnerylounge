"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Volume2, VolumeX } from "lucide-react";

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

export default function AmbientAudio({ active, musicUrl, musicPlaying, musicFileId, hasVideoBackdrop, pauseWhenBusy = false }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);
  const prevSrcRef = useRef("");
  const fadeTimerRef = useRef(null);
  const autoPausedRef = useRef(false);

  const ambientWav = useMemo(() => (active ? generateAmbientWav() : ""), [active]);

  const baseSrc = useMemo(() => {
    if (!active) return "";
    if (musicPlaying && musicFileId) return `/api/rooms/music/stream?id=${musicFileId}`;
    if (musicPlaying && musicUrl) return musicUrl;
    if (hasVideoBackdrop) return "";
    return ambientWav;
  }, [active, musicPlaying, musicFileId, musicUrl, hasVideoBackdrop, ambientWav]);

  const src = baseSrc;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;

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
          audio.play().then(() => {
            let fadeVol = 0;
            const fadeInterval = setInterval(() => {
              fadeVol += 0.05;
              if (fadeVol >= 1) {
                clearInterval(fadeInterval);
                audio.volume = 1;
              } else {
                audio.volume = fadeVol;
              }
            }, 50);
          }).catch(() => {});
        } else {
          audio.volume = vol;
        }
      }, 50);
    } else {
      audio.src = src;
      audio.load();
      audio.play().then(() => setPlaying(true)).catch(() => {});
    }

    prevSrcRef.current = src;
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (pauseWhenBusy) {
      if (!audio.paused) autoPausedRef.current = true;
      audio.pause();
    } else if (autoPausedRef.current) {
      autoPausedRef.current = false;
      if (src) audio.play().catch(() => {});
    }
  }, [pauseWhenBusy, src]);

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
    if (!audio || pauseWhenBusy) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }

  if (!active) return null;

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
        <button
          onClick={toggle}
          aria-label={playing ? "Mute music" : "Play music"}
          style={{
            position: "fixed",
            bottom: 24,
            left: 24,
            zIndex: 999,
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
          {playing ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>
      )}
    </>
  );
}
