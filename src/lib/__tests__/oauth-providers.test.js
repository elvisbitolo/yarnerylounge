import { test } from "node:test";
import assert from "node:assert/strict";
import { oauthAuthorizeOptions, oauthFailedKey } from "../oauth-providers.js";

const APP = "https://www.christasspeakeasy.com";

// --- redirectTo -------------------------------------------------------------

test("login returns to /login carrying the provider marker", () => {
  const options = oauthAuthorizeOptions({ provider: "google", mode: "login", appUrl: APP });
  assert.equal(options.redirectTo, `${APP}/login?provider=google`);
});

test("signup returns to /signup carrying the provider marker", () => {
  const options = oauthAuthorizeOptions({ provider: "facebook", mode: "signup", appUrl: APP });
  assert.equal(options.redirectTo, `${APP}/signup?provider=facebook`);
});

// The marker is what lets the return leg tell a real return from a stale link
// and which provider's failure copy to show, so it must never be dropped.
test("the provider marker survives for every provider", () => {
  for (const provider of ["google", "facebook", "linkedin", "twitch"]) {
    for (const mode of ["login", "signup"]) {
      const { redirectTo } = oauthAuthorizeOptions({ provider, mode, appUrl: APP });
      assert.ok(redirectTo.includes(`?provider=${provider}`), `${provider}/${mode}`);
    }
  }
});

// The regression: Google's authorize options were reused verbatim for every
// provider once a second one was added. Facebook has no `openid` scope and no
// account chooser, and passing either makes the authorize call fail — so the
// button would render, the member would tap it, and nothing would happen.
test("facebook is NOT given google's scopes or account chooser", () => {
  const options = oauthAuthorizeOptions({ provider: "facebook", mode: "login", appUrl: APP });
  assert.equal(options.scopes, undefined);
  assert.equal(options.prompt, undefined);
});

test("facebook is NOT given google's scopes on signup either", () => {
  const options = oauthAuthorizeOptions({ provider: "facebook", mode: "signup", appUrl: APP });
  assert.equal(options.scopes, undefined);
  assert.equal(options.prompt, undefined);
});

// Facebook relies on GoTrue's own default scopes (which request `email`, and
// that is what yields a verified address), so its options must be an empty
// object rather than an override that could drift.
test("facebook sends only the redirect, leaving scopes to GoTrue", () => {
  const options = oauthAuthorizeOptions({ provider: "facebook", mode: "login", appUrl: APP });
  assert.deepEqual(Object.keys(options), ["redirectTo"]);
});

test("google keeps its scopes and account chooser", () => {
  const options = oauthAuthorizeOptions({ provider: "google", mode: "login", appUrl: APP });
  assert.equal(options.scopes, "profile email openid");
  assert.equal(options.prompt, "select_account");
});

// --- unsupported providers ---------------------------------------------------

test("an unknown provider throws instead of silently signing in with google", () => {
  assert.throws(
    () => oauthAuthorizeOptions({ provider: "spotify", mode: "login", appUrl: APP }),
    /Unsupported sign-in provider: spotify/
  );
});

test("a missing provider throws", () => {
  assert.throws(
    () => oauthAuthorizeOptions({ mode: "login", appUrl: APP }),
    /Unsupported sign-in provider/
  );
});

// --- failure copy ------------------------------------------------------------

test("each provider reports its own failure", () => {
  assert.equal(oauthFailedKey("facebook"), "facebookFailed");
  assert.equal(oauthFailedKey("google"), "googleFailed");
});

test("an unknown marker still gets real copy", () => {
  assert.equal(oauthFailedKey("spotify"), "googleFailed");
  assert.equal(oauthFailedKey(undefined), "googleFailed");
  assert.equal(oauthFailedKey(null), "googleFailed");
});

// --- linkedin / twitch --------------------------------------------------------

// LinkedIn must ask for OIDC scopes only. The legacy flow requested
// r_emailaddress/r_liteprofile, which LinkedIn is sunsetting, and mixing the two
// scope sets fails the authorize call outright.
test("linkedin asks for OIDC scopes and no account chooser", () => {
  const options = oauthAuthorizeOptions({ provider: "linkedin", mode: "login", appUrl: APP });

// Twitch, like Facebook, relies on GoTrue's own default scopes
// (user:read:email). An override here would be the thing that breaks it.
test("twitch sends only the redirect, leaving scopes to GoTrue", () => {
  const options = oauthAuthorizeOptions({ provider: "twitch", mode: "signup", appUrl: APP });
  assert.deepEqual(Object.keys(options), ["redirectTo"]);
});
  assert.equal(options.scopes, "openid email profile");
  assert.equal(options.prompt, undefined);
});

// Spotify remains the documented exclusion, so the throw is now load-bearing:
// it proves the guard rejects the one provider that can never pass the
// verified-email check rather than rendering a dead button.
test("spotify stays rejected while the supported four are accepted", () => {
  for (const provider of ["google", "facebook", "linkedin", "twitch"]) {
    assert.ok(oauthAuthorizeOptions({ provider, mode: "login", appUrl: APP }).redirectTo, provider);
  }
  assert.throws(
    () => oauthAuthorizeOptions({ provider: "spotify", mode: "login", appUrl: APP }),
    /Unsupported sign-in provider: spotify/
  );
});

// The GoTrue key is lowercase `linkedin` but the message key is `linkedInFailed`.
// A wrong key renders as a literal string in the UI, so this is pinned per
// provider rather than derived from `provider + "Failed"`.
test("linkedin and twitch report their own failures", () => {
  assert.equal(oauthFailedKey("linkedin"), "linkedInFailed");
  assert.equal(oauthFailedKey("twitch"), "twitchFailed");
});

test("every supported provider has a distinct failure key", () => {
  const keys = ["google", "facebook", "linkedin", "twitch"].map(oauthFailedKey);
  assert.equal(new Set(keys).size, keys.length);
});
