"use client";

import { useSyncExternalStore } from "react";

// Shared client-side view of the viewer's starred messages, keyed by
// conversation id. The thread's star toggles and the info drawer's "Starred"
// list read and write through here so both stay in sync without a refetch.

let state = {};

const EMPTY_SET = new Set();
const listeners = new Set();

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener();
}

export function initStars(byConversation) {
  const next = {};
  for (const [conversationId, ids] of Object.entries(byConversation || {})) {
    next[conversationId] = new Set(
      Array.isArray(ids) ? ids : Object.keys(ids && typeof ids === "object" ? ids : {})
    );
  }
  state = next;
  emit();
}

export function starredIdsFor(conversationId) {
  return state[conversationId] || EMPTY_SET;
}

export function isStarred(conversationId, messageId) {
  return (state[conversationId] || EMPTY_SET).has(messageId);
}

export function setStarred(conversationId, messageId, starred) {
  const next = new Set(state[conversationId] || EMPTY_SET);
  if (starred) next.add(messageId);
  else next.delete(messageId);
  state = { ...state, [conversationId]: next };
  emit();
}

export function useStarredIds(conversationId) {
  return useSyncExternalStore(subscribe, () => state)[conversationId] || EMPTY_SET;
}