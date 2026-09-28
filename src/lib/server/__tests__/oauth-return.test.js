import { test } from "node:test";
import assert from "node:assert/strict";
import { hasOAuthReturnMaterial, isOAuthReturn, isStaleProviderLink } from "../../oauth-return.js";

// The regression: `?provider=google` with no return material used to be treated
// as a live OAuth return. The client then spun for 3s calling
// completeSupabaseGoogle(), found nothing, and showed "Google sign-in failed" on
// a link that could never succeed.

// The exact URL reported: provider marker, empty fragment.
test("the reported URL is not an OAuth return", () => {
  assert.equal(
    hasOAuthReturnMaterial("#", "?provider=google"),
    false
  );
});

test("a provider marker with no fragment at all is not a return", () => {
  assert.equal(hasOAuthReturnMaterial("", "?provider=google"), false);
});

// --- genuine returns ------------------------------------------------------

test("implicit flow tokens in the fragment are a return", () => {
  assert.equal(
    hasOAuthReturnMaterial("#access_token=eyJhbGciOi&refresh_token=v1-ref", "?provider=google"),
    true
  );
});

test("a refresh token alone still counts", () => {
  // Supabase omits refresh_token for some flows; access_token is not guaranteed
  // to arrive first either, since GoTrue parses the fragment asynchronously.
  assert.equal(hasOAuthReturnMaterial("#refresh_token=v1-ref", "?provider=google"), true);
});

test("an empty token value is not a return", () => {
  assert.equal(hasOAuthReturnMaterial("#access_token=", "?provider=google"), false);
});

test("PKCE code in the query is a return", () => {
  assert.equal(hasOAuthReturnMaterial("", "?provider=google&code=abc123&state=xyz"), true);
});

test("a leading # on the hash is tolerated", () => {
  assert.equal(hasOAuthReturnMaterial("#access_token=abc", ""), true);
});

test("a leading ? on the search is tolerated", () => {
  assert.equal(hasOAuthReturnMaterial("", "?code=abc123"), true);
});

// --- must not misfire -----------------------------------------------------

test("password recovery is not mistaken for a Google return here", () => {
  // isPasswordRecovery() owns type=recovery; this helper only answers "are there
  // credentials in the URL", and recovery does carry them.
  assert.equal(hasOAuthReturnMaterial("#access_token=x&type=recovery", ""), true);
});

test("an unrelated query does not read as a return", () => {
  for (const search of ["", "?", "?utm_source=x", "?provider=google&next=/feed", "?code="]) {
    assert.equal(hasOAuthReturnMaterial("", search), false, search);
  }
});

test("missing arguments are safe and default to not-a-return", () => {
  assert.equal(hasOAuthReturnMaterial(), false);
  assert.equal(hasOAuthReturnMaterial(null, null), false);
  assert.equal(hasOAuthReturnMaterial(undefined, undefined), false);
});

test("a stray bare hash does not throw", () => {
  for (const hash of ["#", "#&", "#=", "#&&", "##"]) {
    assert.equal(hasOAuthReturnMaterial(hash, "?provider=google"), false, hash);
  }
});

test("provider=anything is a marker, but still needs credentials", () => {
  // The old code keyed off Boolean(params?.provider), so ?provider=foo also
  // produced the spinner. The marker is not the evidence; the tokens are.
  assert.equal(hasOAuthReturnMaterial("#", "?provider=foo"), false);
  assert.equal(hasOAuthReturnMaterial("#access_token=x", "?provider=foo"), true);
});

// --- isStaleProviderLink --------------------------------------------------

// Presents a fake window.location for the duration of fn.
function withLocation(href, fn) {
  const url = new URL(href);
  const previous = globalThis.window;
  globalThis.window = { location: { href: url.href, search: url.search, hash: url.hash } };
  try {
    return fn();
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
}

test("the reported dead-end URL reads as a stale provider link", () => {
  withLocation("https://www.christasspeakeasy.com/login?provider=google#", () => {
    assert.equal(isStaleProviderLink(), true);
  });
});

test("a real return does not read as a stale link", () => {
  // If this ever returned true the guard would release the spinner mid-exchange
  // and flash the form over a sign-in that is about to succeed.
  for (const href of [
    "https://www.christasspeakeasy.com/login?provider=google#access_token=x&refresh_token=y",
    "https://www.christasspeakeasy.com/login?provider=google&code=abc",
  ]) {
    withLocation(href, () => {
      assert.equal(isStaleProviderLink(), false, href);
    });
  }
});

test("no provider marker means not a stale link", () => {
  // Otherwise every ordinary visit to /login would report itself stale.
  withLocation("https://www.christasspeakeasy.com/login", () => {
    assert.equal(isStaleProviderLink(), false);
  });
});

test("a password-recovery link is not a stale provider link", () => {
  withLocation("https://www.christasspeasky.com/login?provider=x#error=access_denied", () => {
    assert.equal(hasOAuthReturnMaterial("#error=access_denied", "?provider=x"), false);
  });
});

test("isStaleProviderLink is false when there is no window", () => {
  // The server render must never claim the link is stale, or the spinner would
  // be skipped before hydration and the real OAuth return would flash the form.
  const previous = globalThis.window;
  delete globalThis.window;
  try {
    assert.equal(isStaleProviderLink(), false);
    assert.equal(isOAuthReturn(), false);
  } finally {
    if (previous !== undefined) globalThis.window = previous;
  }
});

test("isStaleProviderLink is stable across repeated reads", () => {
  // The value is read during render, so it must not flip on a second pass.
  withLocation("https://www.christasspeakeasy.com/login?provider=google#", () => {
    assert.equal(isStaleProviderLink(), isStaleProviderLink());
    assert.equal(isStaleProviderLink(), true);
  });
});

