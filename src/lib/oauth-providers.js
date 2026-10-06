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
  // Key MUST be `linkedin_oidc`, not `linkedin`. GoTrue resolves the id against
  // a config map (internal/api/provider_constants.go): "linkedin" is the legacy
  // provider, "linkedin_oidc" is the one Supabase's "LinkedIn (OIDC)" toggle
  // populates. Sending `linkedin` reaches an empty disabled config and returns
  // 400 "Unsupported provider: provider is not enabled" — no credentials can
  // fix that, because they are attached to the other id.
  //
  // The UI label stays "Continue with LinkedIn"; only the id sent upstream
  // changes. No scopes, deliberately: GoTrue hardcodes exactly openid/email/
  // profile (provider/linkedin_oidc.go) and those are the only three LinkedIn
  // supports. The previous space-scoped override was worse than redundant —
  // GoTrue appends custom scopes with strings.Split(s, ","), so it arrived as
  // ONE bogus token with literal spaces and the authorize call was rejected.
  linkedin_oidc: {},
  // GoTrue asks for user:read:email by default and hardcodes Verified: true.
  // A Twitch account with no email attached yields none, so the member still
  // hits the prepaid gate — unavoidable, and not a configuration mistake.
  twitch: {},
};

// Failure copy for the return leg, keyed off the `?provider=` marker. Without
// this the exchange is provider-agnostic but the error is not, and a Facebook
// return reports "Google sign-in failed".
const OAUTH_FAILED_KEYS = {
  google: "googleFailed",
  facebook: "facebookFailed",
  // Derived, not literal: the GoTrue provider key is lowercase (`linkedin`)
  // while the message key reads `linkedInFailed`, so they cannot both be
  // `provider + "Failed"`. Keep this explicit rather than clever — a wrong
  // key renders as a raw string in the UI, not an error.
  // id differs from the message key: `linkedin_oidc` upstream, human wording here.
  linkedin_oidc: "linkedInFailed",
  twitch: "twitchFailed",
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