import { supabaseBrowser } from "@/lib/supabase/browser";
import { forgetCachedMembership } from "@/lib/membership";
import { beginExplicitLogout } from "@/lib/auth-client";

// Canonical origin for all auth redirect targets. Must be the single public
// host (www.christasspeakeasy.com) — NOT window.location.origin — so an OAuth
// flow started on any stale vercel alias still returns to the origin where the
// Supabase session actually lives.
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");

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
  const { data, error } = await supabaseBrowser.auth.signInWithPassword({
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

export async function loginWithGoogle() {
  await supabaseBrowser.auth.signInWithOAuth({
    provider: "google",
    options: {
      scopes: "profile email openid",
      prompt: "select_account",
      redirectTo: `${APP_URL}/login?provider=google`,
    },
  });
  return { user: null };
}

export async function loginWithSupabaseGoogle() {
  const { error } = await supabaseBrowser.auth.signInWithOAuth({
    provider: "google",
    options: {
      scopes: "profile email openid",
      prompt: "select_account",
      redirectTo: `${APP_URL}/login?provider=google`,
    },
  });
  if (error) throw supabaseError(error);
  return { user: null };
}

export async function signupWithSupabaseEmail(name, email, password) {
  const { data, error } = await supabaseBrowser.auth.signUp({
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
  const { data } = supabaseBrowser.auth.getSession();
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

export async function signupWithGoogle() {
  await supabaseBrowser.auth.signInWithOAuth({
    provider: "google",
    options: {
      scopes: "profile email openid",
      prompt: "select_account",
      redirectTo: `${APP_URL}/signup?provider=google`,
    },
  });
  return { user: null };
}

export async function completeSupabaseGoogle() {
  const { data } = supabaseBrowser.auth.getSession();
  let session = data?.session;
  // Supabase parses the OAuth URL fragment asynchronously after the redirect
  // returns, so getSession() can be empty on first read even though the tokens
  // are sitting in the URL. Wait for it before declaring the flow failed.
  if (!session?.access_token) {
    for (let attempt = 0; attempt < 30 && !session?.access_token; attempt++) {
      await new Promise((r) => setTimeout(r, 100));
      session = (await supabaseBrowser.auth.getSession()).data?.session;
    }
  }
  if (!session?.access_token) {
    return false;
  }
  await createSession({
    supabaseToken: session.access_token,
    supabaseRefreshToken: session.refresh_token || undefined,
  });
  return true;
}

export async function sendPasswordReset(email) {
  const clean = String(email || "").trim();
  if (!clean) throw new Error("Enter your email address");
  const { error } = await supabaseBrowser.auth.resetPasswordForEmail(clean, {
    redirectTo: `${APP_URL}/login`,
  });
  if (error) throw supabaseError(error);
}

export async function resendSignupVerification(email) {
  const { error } = await supabaseBrowser.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${APP_URL}/login` },
  });
  if (error) throw supabaseError(error);
  return true;
}

export async function refreshSupabaseSession() {
  const res = await fetch("/api/auth/refresh", { method: "POST" });
  return res.ok;
}

export async function logout() {
  forgetCachedMembership(supabaseBrowser.auth.getUser()?.user?.id);
  // Tell the auth shim this is a deliberate sign-out BEFORE signOut() fires the
  // null-session event, so it doesn't race /api/me and keep the SPA signed in
  // while the cookie is still being cleared.
  beginExplicitLogout();
  try {
    await supabaseBrowser.auth.signOut();
  } catch {
    // best-effort
  }
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function refreshSession() {
  const { data } = await supabaseBrowser.auth.getSession();
  if (!data?.session?.access_token) {
    const user = supabaseBrowser.auth.getUser()?.user;
    if (!user) return false;
    forgetCachedMembership(user.id);
    return false;
  }
  const refreshed = await refreshSupabaseSession();
  if (!refreshed) return false;
  // Refresh succeeding is not proof the account is usable (a suspended or
  // deleted member's tokens rotate fine). Re-verify against /api/me so this
  // path can never bounce a dead session back into /signing-in.
  try {
    const me = await fetch("/api/me", { cache: "no-store" });
    const meData = await me.json().catch(() => ({}));
    return me.ok && !!meData?.uid;
  } catch {
    return false;
  }
}

// "Auth wall" healer: the httpOnly session cookie holds a Supabase access token
// that expires on its own (~1h), and getCurrentUser never refreshes. When a
// signed-in member lands back on /login or /signup walled, rotate the cookie's
// refresh token first — if the session is alive we get straight into the app,
// otherwise we fall through to the form.
export async function reconcileSessionCookie() {
  const meHasUid = async () => {
    try {
      const me = await fetch("/api/me", { cache: "no-store" });
      if (!me.ok) return false;
      const data = await me.json().catch(() => ({}));
      return !!data?.uid;
    } catch {
      return false;
    }
  };

  // Only trust the cookie when /api/me actually accepts it. A successful
  // /api/auth/refresh alone is NOT proof of a usable session — suspended/
  // deleted accounts refresh fine but getCurrentUser keeps refusing them, so
  // trusting refresh.ok would bounce /signing-in <-> /dashboard <-> /login
  // forever (auto-reloading the tab).
  const needsRefresh = !(await meHasUid());
  if (!needsRefresh) return true;

  try {
    const refreshed = await fetch("/api/auth/refresh", { method: "POST" });
    if (!refreshed.ok) return false;
    return meHasUid();
  } catch {
    return false;
  }
}

function supabaseError(error) {
  const msg = typeof error === "string" ? error : error?.message || "Authentication failed";
  const err = new Error(msg);
  err.code = error?.code || "auth_error";
  if (error?.status) err.status = error.status;
  return err;
}
