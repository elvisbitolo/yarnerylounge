import { supabase } from "@/lib/supabase";
import { forgetCachedMembership } from "@/lib/membership";
import { auth, beginExplicitLogout, endExplicitLogout } from "@/lib/auth-client";
import { oauthAuthorizeOptions } from "@/lib/oauth-providers";

// Canonical origin for all auth redirect targets. Must be the single public
// host (www.christasspeakeasy.com) — NOT window.location.origin — so an OAuth
// flow started on any stale vercel alias still returns to the origin where the
// Supabase session actually lives.
//
// An unusable value (empty, or an unfilled template placeholder such as
// "[SENSITIVE]") is rejected and we fall back to the current origin. Without
// this guard a placeholder flows straight into `redirectTo`, and the member is
// handed to an address that does not exist — the Google sign-in appears to do
// nothing at all.
const CONFIGURED_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";
const APP_URL = /^https?:\/\/[^\s"']+$/i.test(CONFIGURED_APP_URL)
  ? CONFIGURED_APP_URL.replace(/\/+$/, "")
  : typeof window !== "undefined"
    ? window.location.origin
    : "";

async function createSession({ supabaseToken, supabaseRefreshToken, name } = {}) {
  const body = {};
  if (supabaseToken) body.supabaseToken = supabaseToken;
  if (supabaseRefreshToken) body.supabaseRefreshToken = supabaseRefreshToken;
  if (name) body.name = name;
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 800));
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

export async function checkPaidSignup(email) {
  const res = await fetch("/api/auth/precheck", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (res.ok) {
    const data = await res.json();
    if (data.allowed) return { ok: true, plan: data.plan, openAccess: !!data.openAccess };
  }
  const data = await res.json().catch(() => ({}));
  if (data.redirect) {
    const err = new Error(data.message || "Membership required");
    err.code = "not_prepaid";
    err.redirect = data.redirect;
    throw err;
  }
  throw new Error(data.message || "Could not check membership");
}

export async function loginWithSupabaseEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    if (error.code === "invalid_credentials") {
      throw new Error("That email and password combination does not match our records.");
    }
    if (error.code === "user_not_found") {
      throw new Error("That email and password combination does not match our records.");
    }
    if (error.code === "email_not_confirmed") {
      throw new Error("Please verify your email first — check your inbox for the confirmation link.");
    }
    throw new Error(error.message || "Could not sign in. Please try again.");
  }
  const session = data?.session;
  if (session?.access_token) {
    await createSession({
      supabaseToken: session.access_token,
      supabaseRefreshToken: session.refresh_token || undefined,
    });
  }
  return { user: null };
}

export async function loginWithOAuthProvider(provider) {
  await supabase.auth.signInWithOAuth({
    provider,
    options: oauthAuthorizeOptions({ provider, mode: "login", appUrl: APP_URL }),
  });
  return { user: null };
}

export async function loginWithSupabaseOAuthProvider(provider) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: oauthAuthorizeOptions({ provider, mode: "login", appUrl: APP_URL }),
  });
  if (error) throw supabaseError(error);
  return { user: null };
}

export async function signupWithSupabaseEmail(name, email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${APP_URL}/login`,
      data: { name },
    },
  });
  if (error) throw supabaseError(error);
  const session = data?.session;
  if (session?.access_token) {
    await createSession({
      supabaseToken: session.access_token,
      supabaseRefreshToken: session.refresh_token || undefined,
    });
  }
  return { user: null, confirm: !session?.access_token };
}

export async function signupWithEmail(name, email, password) {
  await checkPaidSignup(email);
  await signupWithSupabaseEmail(name, email, password);
  const { data } = supabase.auth.getSession();
  if (data?.session?.access_token) {
    try {
      await createSession({
        supabaseToken: data.session.access_token,
        supabaseRefreshToken: data.session.refresh_token || undefined,
        name,
      });
    } catch {
      // Best-effort.
    }
  }
  return { user: null };
}

export async function signupWithOAuthProvider(provider) {
  await supabase.auth.signInWithOAuth({
    provider,
    options: oauthAuthorizeOptions({ provider, mode: "signup", appUrl: APP_URL }),
  });
  return { user: null };
}

export async function loginWithGoogle() {
  return loginWithOAuthProvider("google");
}

export async function loginWithSupabaseGoogle() {
  return loginWithSupabaseOAuthProvider("google");
}

export async function signupWithGoogle() {
  return signupWithOAuthProvider("google");
}

// Finishes any provider's return leg. Nothing here is Google-specific: GoTrue
// has already exchanged the tokens by the time this runs, so the only job left
// is handing the resulting session to createSession(). Named for the provider
// that was the only one wired up when this was written, not because it depends
// on it.
export async function completeOAuthReturn() {
  const { data } = await supabase.auth.getSession();
  let session = data?.session;
  // Supabase parses the OAuth URL fragment asynchronously after the redirect
  // returns, so getSession() can be empty on first read even though the tokens
  // are sitting in the URL. Wait for it before declaring the flow failed.
  if (!session?.access_token) {
    for (let attempt = 0; attempt < 30 && !session?.access_token; attempt++) {
      await new Promise((r) => setTimeout(r, 100));
      session = (await supabase.auth.getSession()).data?.session;
    }
  }
  if (!session?.access_token) {
    return false;
  }
  const created = await createSession({
    supabaseToken: session.access_token,
    supabaseRefreshToken: session.refresh_token || undefined,
  });
  // A brand-new account has not accepted the Terms of Service yet: say so, so
  // the caller goes straight to /consent instead of walking into /dashboard
  // and bouncing back out again.
  if (created?.data?.needsConsent) return "consent";
  return true;
}

// Kept for the existing callers that still import the Google-named spelling.
export async function completeSupabaseGoogle() {
  return completeOAuthReturn();
}

export async function sendPasswordReset(email) {
  const clean = String(email || "").trim();
  if (!clean) throw new Error("Enter your email address");
  const { error } = await supabase.auth.resetPasswordForEmail(clean, {
    redirectTo: `${APP_URL}/login`,
  });
  if (error) throw supabaseError(error);
}

// True when the current URL carries the Supabase password-recovery tokens
// (the reset email's link lands on {APP_URL}/login#access_token=...&type=recovery).
export function isPasswordRecovery() {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash.replace(/^#/, "");
  return new URLSearchParams(hash).get("type") === "recovery";
}

// Completes a password reset: sets the new password on the recovery session,
// then exchanges the Supabase session for the httpOnly cookie so the member
// lands straight inside the app without signing in again.
export async function completePasswordRecovery(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw supabaseError(error);

  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session?.access_token) return false;

  await createSession({
    supabaseToken: session.access_token,
    supabaseRefreshToken: session.refresh_token || undefined,
  });
  return true;
}

export async function resendSignupVerification(email) {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${APP_URL}/login` },
  });
  if (error) throw supabaseError(error);
  return true;
}

// Asks the server whether the httpOnly cookie still authorizes a member.
// Returns true / false / null ("could not tell right now") / "consent" (a live
// session held by a member who has not yet accepted the Terms of Service).
async function meVerdict() {
  try {
    const me = await fetch("/api/me", { cache: "no-store" });
    // 503 means the Session store was unreachable, not that the member is
    // signed out. Never let a blip on this shared endpoint end a session.
    if (me.status === 503) return null;
    // Checked before `!me.ok` because this one IS a non-2xx — but it means
    // "signed in, just not allowed in yet", which must not be mistaken for a
    // dead session (that would fire a pointless refresh and, worse, could be
    // read as "the form is the right screen").
    if (me.status === 403 && !me.ok) {
      const data = await me.json().catch(() => ({}));
      if (data?.error === "terms_consent_required") return "consent";
    }
    if (!me.ok) return false;
    const data = await me.json().catch(() => ({}));
    return !!data?.uid;
  } catch {
    return null;
  }
}

// "Auth wall" healer, and the one implementation behind every sign-in handoff.
// A member who already holds a valid session cookie is walked straight into the
// app instead of being shown the form: confirm the cookie with /api/me, and if
// it cannot be confirmed, let the server rotate it via /api/auth/refresh and
// ask again.
//
// A successful /api/auth/refresh alone is NOT proof of a usable session —
// suspended/deleted accounts refresh fine but getCurrentUser keeps refusing
// them, so trusting refresh.ok would bounce /signing-in <-> /dashboard <->
// /login forever (auto-reloading the tab). /api/me is the only authority.
//
// Returns true = confirmed, null = could not tell, "consent" = a healthy
// session the member may not use until they accept the Terms of Service.
export async function reconcileSessionCookie() {
  const verdict = await meVerdict();
  // The cookie is fine and the session is fine — only the missing ToS
  // acceptance is in the way, so there is nothing to rotate. Pass the verdict
  // straight through and let the caller send them to /consent.
  if (verdict === "consent") return "consent";
  // true = session confirmed, null = could not tell. Either way the member
  // holds a cookie and walks in; only a definitive "no" falls through to the
  // rotate-and-retry below. Flashing the sign-in form on a transient fault is
  // what made healthy sessions look broken.
  if (verdict !== false) return true;

  try {
    const refreshed = await fetch("/api/auth/refresh", { method: "POST" });
    if (!refreshed.ok) return false;
    const again = await meVerdict();
    if (again === "consent") return "consent";
    return again === true;
  } catch {
    return false;
  }
}

// The `?session_refresh` handoff is the same question asked the same way, so it
// shares one implementation rather than drifting from the auth wall.
export async function refreshSession() {
  return reconcileSessionCookie();
}

export async function logout() {
  // Drop the shim's cached user before anything async runs, so no in-flight
  // /api/me re-check can re-paint the member as signed in behind us.
  beginExplicitLogout();
  const cached = auth.currentUser;
  if (cached?.uid) forgetCachedMembership(cached.uid);
  // The server owns the tokens; this only clears the in-memory copy the browser
  // client is holding. /api/auth/logout is what actually ends the session.
  try {
    await supabase.auth.signOut();
  } catch {
    // best-effort
  }
  await fetch("/api/auth/logout", { method: "POST" });
  endExplicitLogout();
}

function supabaseError(error) {
  const msg = typeof error === "string" ? error : error?.message || "Authentication failed";
  const err = new Error(msg);
  err.code = error?.code || "auth_error";
  if (error?.status) err.status = error.status;
  return err;
}
