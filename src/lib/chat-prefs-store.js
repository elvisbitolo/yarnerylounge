"use client";

import { useSyncExternalStore } from "react";
import { CHAT_SETTINGS_DEFAULTS, resolveChatPrefs } from "@/lib/chat-settings-core";

// Shared client-side view of the viewer's chat preferences. The rail and the
// settings/info drawers all read and write through this store so a pin, archive
// or mute changes everywhere at once, without a page reload round trip.

let state = {
  settings: { ...CHAT_SETTINGS_DEFAULTS },
  prefs: {},
};

const listeners = new Set();

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener();
}

export function initChatPrefs({ settings, prefsById }) {
  state = {
    settings: { ...CHAT_SETTINGS_DEFAULTS, ...(settings || {}) },
    prefs: prefsById || {},
  };
  emit();
}

export function setChatSettings(settings) {
  state = { ...state, settings: { ...(settings || {}) } };
  emit();
}

export function setConversationPrefs(conversationId, prefs) {
  state = { ...state, prefs: { ...state.prefs, [conversationId]: prefs || {} } };
  emit();
}

export function getChatPrefs() {
  return state;
}

export function rawPrefsFor(conversationId) {
  const stored = state.prefs[conversationId];
  return stored && typeof stored === "object" ? stored : {};
}

export function useChatPrefs() {
  return useSyncExternalStore(subscribe, getChatPrefs);
}

// Resolves the store's stored prefs for a conversation into display flags.
export function resolvedPrefs(conversationId) {
  return resolveChatPrefs(rawPrefsFor(conversationId));
}

// Writes stay on the server (source of truth); the client store is updated only
// after the PATCH succeeds so the UI never claims a change that didn't persist.
export async function saveChatSettings(patch) {
  const res = await fetch("/api/chat/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data && data.settings) setChatSettings(data.settings);
  return data ? data.settings : null;
}

export async function saveConversationPrefs(conversationId, patch) {
  const res = await fetch(`/api/chat/conversations/${conversationId}/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const saved = data && data.prefsRaw ? data.prefsRaw : null;
  if (saved) setConversationPrefs(conversationId, saved);
  return saved;
}