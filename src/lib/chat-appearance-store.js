"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_APPEARANCE } from "@/lib/chat-appearance-core";

// Shared client-side view of the viewer's chat appearance (wallpaper). The
// thread, the settings drawer and the chat-info override all read and write
// through here so a wallpaper change applies everywhere at once.

let state = { ...DEFAULT_APPEARANCE, perChat: {} };

const listeners = new Set();

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener();
}

export function initAppearance(appearance) {
  if (!appearance || typeof appearance !== "object") {
    state = { ...DEFAULT_APPEARANCE, perChat: {} };
  } else {
    state = {
      wallpaper: typeof appearance.wallpaper === "string" ? appearance.wallpaper : "default",
      customWallpaper: typeof appearance.customWallpaper === "string" ? appearance.customWallpaper : "",
      perChat: appearance.perChat && typeof appearance.perChat === "object" ? appearance.perChat : {},
    };
  }
  emit();
}

export function setAppearance(appearance) {
  if (!appearance || typeof appearance !== "object") return;
  state = {
    wallpaper: typeof appearance.wallpaper === "string" ? appearance.wallpaper : "default",
    customWallpaper: typeof appearance.customWallpaper === "string" ? appearance.customWallpaper : "",
    perChat: appearance.perChat && typeof appearance.perChat === "object" ? appearance.perChat : {},
  };
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