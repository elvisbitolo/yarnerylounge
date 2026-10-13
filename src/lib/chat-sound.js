"use client";

// A tiny notification chime for incoming chat messages, played from the rail
// when a conversation the viewer has open-for-sound receives a new message.
// `shouldPlayMessageSound` is a pure decision (respects the messageSound
// setting and per-conversation mute); the audible part stays browser-only.

export function shouldPlayMessageSound({ messageSound, muted, fromSelf }) {
  if (fromSelf) return false;
  if (muted) return false;
  return messageSound !== false;
}

let audioCtx = null;

function ensureContext() {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  } catch {
    return null;
  }
}

// Two short, soft sine tones (E5 -> B5) — a neutral WhatsApp-style "pop" that
// avoids the alert-y sound of system beeps.
export function playMessageChime() {
  const ctx = ensureContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const notes = [659.25, 987.77]; // E5, B5
    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + index * 0.085;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  } catch {
    // playback is best-effort; silence on any failure
  }
}