// Auth surface for the browser, shaped like the app's legacy client API so
// existing components work verbatim. The httpOnly `community-auth` cookie —
// resolved server-side against the Postgres Session store — is the only source
// of truth. No Firebase packages are involved.
//
// Sign-in state is deliberately NOT sourced from `supabase.auth`. The browser
// client runs with `persistSession: false`, so the Supabase session it receives
// at sign-in lives in memory for the life of the tab and holds the *same*
// single-use refresh token the server stored. Any `getSession()` close to expiry
// makes the browser rotate that token; GoTrue's reuse detection then revokes the
// whole refresh-token family, including the server's fresh copy, and the member
// is signed out at the next real rotation. This shim is mounted by ~20
// components, so that trigger used to fire constantly.
"use client";

// Returned by serverSessionUser() when the server could not reach the Session
// store, or the request itself failed. It is NOT "signed out" — callers must
// leave the current state alone rather than reporting a null user, which is what
// a transient blip used to look like.
export const SESSION_UNAVAILABLE = Symbol("session-unavailable");

// Set by logout() so a deliberate sign-out is never overridden by a /api/me
// re-check racing ahead of the cookie being cleared.
let explicitLogout = false;
let emitGen = 0;

export function beginExplicitLogout() {
  explicitLogout = true;
}

// Called once the server has actually cleared the cookie, so a later sign-in in
// the same document is not permanently suppressed by the logout guard.
export function endExplicitLogout() {
  explicitLogout = false;
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
// never disagrees with what the server will let the user reach. Returns
// SESSION_UNAVAILABLE when the answer is unknown rather than guessing "signed
// out".
async function serverSessionUser() {
  try {
    const res = await fetch("/api/me", { cache: "no-store" });
    if (res.status === 503) return SESSION_UNAVAILABLE;
    if (!res.ok) return null;
    return buildUserFromServer(await res.json().catch(() => null));
  } catch {
    // Network error / offline. Unknown, not signed out.
    return SESSION_UNAVAILABLE;
  }
}

// Legacy-compatible `onAuthStateChanged(auth, cb)`. Emits the server's verdict
// on mount and whenever the window regains focus (a sign-in or sign-out in
// another tab changes the cookie without a reload here). Returns an unsubscribe
// function.
export function onAuthStateChanged(_auth, callback) {
  let disposed = false;

  async function emit() {
    const gen = ++emitGen;
    if (explicitLogout) {
      auth.setCurrentUser(null);
      callback(null);
      return;
    }
    const user = await serverSessionUser();
    if (disposed || gen !== emitGen) return;
    // Unknown verdict: keep whatever we already had. Reporting null here is
    // what turned a momentary outage into a sign-out.
    if (user === SESSION_UNAVAILABLE) return;
    auth.setCurrentUser(user);
    callback(user);
  }

  emit();

  const onFocus = () => {
    emit();
  };
  window.addEventListener("focus", onFocus);

  return () => {
    disposed = true;
    window.removeEventListener("focus", onFocus);
  };
}
