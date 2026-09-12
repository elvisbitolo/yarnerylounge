// Supabase-backed auth surface for the browser, shaped like the app's legacy
// client API so existing components work verbatim. No Firebase packages are
// involved — sign-in state is streamed from the Supabase browser client, with
// the httpOnly session cookie as the ultimate source of truth.
"use client";

import { supabaseBrowser } from "@/lib/supabase/browser";

function toAuthUser(sbUser) {
  if (!sbUser) return null;
  return {
    uid: sbUser.id,
    id: sbUser.id,
    email: sbUser.email || "",
    displayName: sbUser.user_metadata?.name || "",
    photoURL: sbUser.user_metadata?.avatar_url || sbUser.user_metadata?.picture || "",
  };
}

// Set by logout() so a deliberate sign-out is never overridden by a /api/me
// re-check racing ahead of the cookie being cleared.
let explicitLogout = false;
let emitGen = 0;

export function beginExplicitLogout() {
  explicitLogout = true;
}

export const app = {};

// Mirrors the app's legacy `auth` object: `currentUser` is populated once the
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

function buildUserFromServer(me) {
  if (!me || !me.uid) return null;
  return {
    uid: me.uid,
    id: me.uid,
    email: me.email || "",
    displayName: me.name || "",
    photoURL: me.photoURL || "",
  };
}

// Server session truth. /api/me self-heals (rotates the cookie when the access
// token is stale) and is the same check every protected page uses, so this
// never disagrees with what the server will let the user reach.
async function serverSessionUser() {
  try {
    const res = await fetch("/api/me", { cache: "no-store" });
    if (!res.ok) return null;
    return buildUserFromServer(await res.json().catch(() => null));
  } catch {
    return null;
  }
}

// Legacy-compatible `onAuthStateChanged(auth, cb)`. Emits once synchronously
// with the recovered session (INITIAL_SESSION), then on every change. Returns
// an unsubscribe function.
export function onAuthStateChanged(_auth, callback) {
  const { data } = supabaseBrowser.auth.onAuthStateChange(async (_event, session) => {
    const user = toAuthUser(session?.user || null);
    const gen = ++emitGen;
    if (user) {
      explicitLogout = false;
      auth.setCurrentUser(user);
      callback(user);
      return;
    }

    // The browser-side Supabase session vanished (expired/rotated localStorage
    // tokens). That alone must NOT sign the SPA out — the httpOnly cookie may
    // still be perfectly valid. Only report signed-out when the server agrees.
    if (explicitLogout) {
      auth.setCurrentUser(null);
      callback(null);
      return;
    }

    const serverUser = await serverSessionUser();
    if (gen !== emitGen) return;
    auth.setCurrentUser(serverUser);
    callback(serverUser);
  });

  // Seed from the server when there is no cached browser session (fresh load,
  // or localStorage was cleared) so observers never sit on "signed out" while
  // the cookie is healthy.
  if (!auth.currentUser) {
    serverSessionUser()
      .then((user) => {
        if (user && !explicitLogout) {
          auth.setCurrentUser(user);
          callback(user);
        }
      })
      .catch(() => {});
  }

  return () => data?.subscription?.unsubscribe();
}