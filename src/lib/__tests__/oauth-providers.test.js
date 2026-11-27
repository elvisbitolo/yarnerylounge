import { test } from "node:test";
import assert from "node:assert/strict";
import { oauthAuthorizeOptions, oauthFailedKey } from "../oauth-providers.js";

const APP = "https://www.christasspeakeasy.com";
const SUPPORTED = ["google", "facebook"];

test("login returns to /login carrying the provider marker", () => {
  const options = oauthAuthorizeOptions({ provider: "google", mode: "login", appUrl: APP });
  assert.equal(options.redirectTo, `${APP}/login?provider=google`);
});

test("signup returns to /signup carrying the provider marker", () => {
  const options = oauthAuthorizeOptions({ provider: "facebook", mode: "signup", appUrl: APP });
  assert.equal(options.redirectTo, `${APP}/signup?provider=facebook`);
});

test("the provider marker survives for every supported provider", () => {
  for (const provider of SUPPORTED) {
    for (const mode of ["login", "signup"]) {
      const { redirectTo } = oauthAuthorizeOptions({ provider, mode, appUrl: APP });
      assert.ok(redirectTo.includes(`?provider=${provider}`), `${provider}/${mode}`);
    }
  }
});

test("facebook is NOT given google's scopes or account chooser", () => {
  const options = oauthAuthorizeOptions({ provider: "facebook", mode: "login", appUrl: APP });
  assert.equal(options.scopes, undefined);
  assert.equal(options.prompt, undefined);
});

test("facebook sends only the redirect, leaving scopes to GoTrue", () => {
  const options = oauthAuthorizeOptions({ provider: "facebook", mode: "signup", appUrl: APP });
  assert.deepEqual(Object.keys(options), ["redirectTo"]);
});

test("google keeps its scopes and account chooser", () => {
  const options = oauthAuthorizeOptions({ provider: "google", mode: "login", appUrl: APP });
  assert.equal(options.scopes, "profile email openid");
  assert.equal(options.prompt, "select_account");
});

test("unsupported providers throw instead of silently signing in with google", () => {
  for (const provider of ["spotify", "linkedin_oidc", "twitch"]) {
    assert.throws(
      () => oauthAuthorizeOptions({ provider, mode: "login", appUrl: APP }),
      /Unsupported sign-in provider/
    );
  }
});

test("a missing provider throws", () => {
  assert.throws(
    () => oauthAuthorizeOptions({ mode: "login", appUrl: APP }),
    /Unsupported sign-in provider/
  );
});

test("each supported provider reports its own failure", () => {
  assert.equal(oauthFailedKey("facebook"), "facebookFailed");
  assert.equal(oauthFailedKey("google"), "googleFailed");
});

test("an unknown marker still gets real copy", () => {
  for (const provider of ["spotify", "linkedin_oidc", "twitch", undefined, null]) {
    assert.equal(oauthFailedKey(provider), "googleFailed");
  }
});

test("every supported provider has a distinct failure key", () => {
  const keys = SUPPORTED.map(oauthFailedKey);
  assert.equal(new Set(keys).size, keys.length);
});
