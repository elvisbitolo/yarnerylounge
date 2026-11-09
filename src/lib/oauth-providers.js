// Every fact this app knows about an OAuth provider, in one dependency-free
// module so it stays unit-testable (the `node --test` suite resolves no `@/`
// aliases and has no module mocking, so anything importing `client-auth.js`
// cannot be tested directly — see `oauth-return.js` for the same pattern).
//
// Two things live here, and keeping them together is deliberate: the authorize
// options and the failure copy are both per-provider, and adding a provider
// should never require hunting through a form to find the other half.

// Authorize options, sent to `supabase.auth.signInWithOAuth`.
//
// The session exchange in client-auth.js is provider-agnostic, but the *authorize*
// request is not, and that asymmetry is the trap: Google's options cannot be
// reused across providers. Facebook has no `openid` scope and no account chooser,
// and handing it `scopes: "profile email openid"` / `prompt: "select_account"`
// makes the authorize call fail outright. So each provider carries its own
// options and they are merged per call.
//
// Deliberately NOT set for Facebook: its scopes. GoTrue already requests `email`
// in the provider's own default scopes (internal/api/provider/facebook.go), and
// that default is what puts a verified address into the session — which is what
// lets /api/auth/session accept the sign-in. Overriding it here would be the one
// thing that breaks it.
//
// Spotify is intentionally absent. GoTrue hardcodes `Verified: false` for it
// (provider/spotify.go), so it can never clear the verified-email check in
// /api/auth/session — every attempt would 403.
const OAUTH_AUTHORIZE = {
  google: { scopes: "profile email openid", prompt: "select_account" },
  facebook: {},
};

// Failure copy for the return leg, keyed off the `?provider=` marker. Without
// this the exchange is provider-agnostic but the error is not, and a Facebook
// return reports "Google sign-in failed".
const OAUTH_FAILED_KEYS = {
  google: "googleFailed",
  facebook: "facebookFailed",
};

// Builds the `options` for a signInWithOAuth call.
//
// `mode` is the page the provider returns to, echoed back as `?provider=` so the
// return leg knows which exchange it is finishing. `appUrl` is passed in rather
// than read from the environment here, so this function stays pure.
export function oauthAuthorizeOptions({ provider, mode, appUrl }) {
  const config = OAUTH_AUTHORIZE[provider];
  if (!config) throw new Error(`Unsupported sign-in provider: ${provider}`);
  return {
    ...config,
    redirectTo: `${appUrl}/${mode}?provider=${provider}`,
  };
}

// Falls back to Google's wording for an unrecognised marker, so a hand-edited or
// half-stripped URL still gets real copy instead of a raw message key.
export function oauthFailedKey(provider) {
  return OAUTH_FAILED_KEYS[provider] || OAUTH_FAILED_KEYS.google;
}