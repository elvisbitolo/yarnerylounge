import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  getIdToken,
} from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { forgetCachedMembership } from "@/lib/membership";

async function createSession(idToken, name) {
  let lastError = "";
  // Transient failures (Firestore quota spikes, server 5xx) can clear with a
  // single retry; auth rejections are final and are not retried.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 800));
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(name ? { idToken, name } : { idToken }),
    });
    if (res.ok) {
      const data = await res.json();
      return { user: null, data };
    }
    const data = await res.json().catch(() => ({}));
    lastError = data.error || "";

    if (res.status === 403) {
      if (data.error === "email_not_verified") {
        const err = new Error(
          "Please verify your email first — check your inbox for the confirmation link."
        );
        err.code = "email_not_verified";
        throw err;
      }
      if (data.error === "not_prepaid") {
        const err = new Error(data.message || "This account needs a paid Speakeasy membership.");
        err.code = "not_prepaid";
        err.redirect = data.redirect || "";
        throw err;
      }
      throw new Error(data.error || "Could not create session");
    }
    if (res.status === 409) {
      const err = new Error(data.error || "No account found");
      err.code = data.error === "no_account" ? "no_account" : "session_failed";
      throw err;
    }
    if (res.status === 401) {
      const err = new Error(data.error || "Session expired. Please sign out and try again.");
      err.code = "session_failed";
      throw err;
    }
    if (res.status === 429) {
      const err = new Error(data.error || "Too many attempts. Please try again shortly.");
      err.code = "rate_limited";
      throw err;
    }
    // 400 / 5xx — retry once, then give the user a clear message.
    if (attempt === 1) {
      const err = new Error(
        data.message ||
          (data.error === "server_error"
            ? "Could not create your session. Please try again."
            : lastError || "Failed to create session. Please try again.")
      );
      err.code = "session_failed";
      throw err;
    }
  }
  const err = new Error("Failed to create session. Please try again.");
  err.code = "session_failed";
  throw err;
}

// The signup wall: verifies an email has a paid Shopify-checkout record in
// Firestore BEFORE a Firebase Auth account is created. Returns
// { ok: true } or throws a typed error with `.redirect` to the speakeasy page.
export async function checkPaidSignup(email) {
  const res = await fetch("/api/auth/precheck", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (res.ok) {
    const data = await res.json();
    return { ok: true, ...data };
  }
  const data = await res.json().catch(() => ({}));
  const err = new Error(data.message || "This account needs a paid Speakeasy membership.");
  err.code = data.error || "not_prepaid";
  err.redirect = data.redirect || "";
  throw err;
}

export async function loginWithGoogle() {
  const cred = await signInWithPopup(auth, new GoogleAuthProvider());
  const idToken = await getIdToken(cred.user);
  const { data } = await createSession(idToken);
  return { user: cred.user, data };
}

export async function signupWithGoogle() {
  const cred = await signInWithPopup(auth, new GoogleAuthProvider());
  const idToken = await getIdToken(cred.user);
  const { data } = await createSession(idToken, cred.user.displayName || "");
  return { user: cred.user, data };
}

export async function loginWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const idToken = await getIdToken(cred.user);
  await createSession(idToken);
  return { user: cred.user };
}

export async function signupWithEmail(name, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  const idToken = await getIdToken(cred.user);
  await createSession(idToken, name);
  return { user: cred.user };
}

export async function logout() {
  if (auth.currentUser) forgetCachedMembership(auth.currentUser.uid);
  await signOut(auth);
  await fetch("/api/auth/logout", { method: "POST" });
}

// Re-fetches the signed-in user's Firestore doc by refreshing the session,
// so a just-completed Shopify purchase shows the new plan/badge immediately.
// Returns true when refreshed, false when there is no signed-in user.
export async function refreshSession() {
  const user = auth.currentUser;
  if (!user) return false;
  forgetCachedMembership(user.uid);
  const idToken = await getIdToken(user, true);
  await createSession(idToken);
  return true;
}
