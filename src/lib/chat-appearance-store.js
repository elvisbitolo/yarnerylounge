"use client";

import { useSyncExternalStore } from "react";
import { ACCENT_IDS, DEFAULT_APPEARANCE } from "@/lib/chat-appearance-core";

// Shared client-side view of the viewer's chat appearance (wallpaper + accent).
// The thread, the settings drawer and the chat-info override all read and write
// through here so a change applies everywhere at once.

let state = { ...DEFAULT_APPEARANCE, perChat: {} };

const listeners = new Set();

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener();
}

const isKnownAccent = (value) => typeof value === "string" && ACCENT_IDS.has(value);

function fromServer(appearance) {
  if (!appearance || typeof appearance !== "object") return { ...DEFAULT_APPEARANCE, perChat: {} };
  return {
    wallpaper: typeof appearance.wallpaper === "string" ? appearance.wallpaper : "default",
    customWallpaper: typeof appearance.customWallpaper === "string" ? appearance.customWallpaper : "",
    perChat: appearance.perChat && typeof appearance.perChat === "object" ? appearance.perChat : {},
    accent: isKnownAccent(appearance.accent) ? appearance.accent : null,
  };
}

export function initAppearance(appearance) {
  state = fromServer(appearance);
  emit();
}

export function setAppearance(appearance) {
  state = fromServer(appearance);
  emit();
}

export function getAppearance() {
  return state;
}

export function useAppearance() {
  return useSyncExternalStore(subscribe, getAppearance);
}

export const appearanceForConversation = (appearance, conversationId) =>
  (appearance.perChat && appearance.perChat[conversationId]) || "default";

// Writes go to the server (source of truth); the client store updates only
// after the PATCH succeeds so the UI never claims a change that didn't persist.
export async function saveChatAppearance(patch) {
  const res = await fetch("/api/chat/appearance", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data && data.appearance) setAppearance(data.appearance);
  return data ? data.appearance : null;
}