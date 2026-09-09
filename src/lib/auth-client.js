// Supabase-backed auth surface for the browser, shaped like the legacy Firebase
// client API so existing components work verbatim. No Firebase packages are
// involved — sign-in state is streamed from the Supabase browser client.
"use client";

import { supabaseBrowser } from "@/lib/supabase/browser";

function toAuthUser(sbUser) {
  if (!sbUser) return null;
  return {
    uid: sbUser.app_metadata?.firebase_uid || sbUser.id,
    id: sbUser.id,
    email: sbUser.email || "",
    displayName: sbUser.user_metadata?.name || "",
    photoURL: sbUser.user_metadata?.avatar_url || sbUser.user_metadata?.picture || "",
  };
}

export const app = {};

// Mirrors Firebase's `auth` object: `currentUser` is populated once the
// onAuthStateChanged subscription below has emitted the initial session.
export const auth = {
  _currentUser: null,
  setCurrentUser(user) {
    this._currentUser = user;
  },
  get currentUser() {
    return this._currentUser;
  },
};

// Firebase-compatible `onAuthStateChanged(auth, cb)`. Emits once synchronously
// with the recovered session (INITIAL_SESSION), then on every change. Returns
// an unsubscribe function.
export function onAuthStateChanged(_auth, callback) {
  const { data } = supabaseBrowser.auth.onAuthStateChange((_event, session) => {
    const user = toAuthUser(session?.user || null);
    auth.setCurrentUser(user);
    callback(user);
  });
  return () => data?.subscription?.unsubscribe();
}