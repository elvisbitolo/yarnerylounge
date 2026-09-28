// Telling a real Google OAuth *return* apart from a stale `?provider=google`
// link that someone bookmarked, reloaded, or shared.
//
// The two are indistinguishable on the server. The app puts `?provider=google`
// in the `redirectTo` it hands Supabase, so every genuine return carries it —
// but the credentials that actually prove the member came back with Google live
// in the URL *fragment*, and fragments are never sent to the server. A server
// reading `?provider=google` therefore cannot tell "mid-exchange" from "tokens
// already spent", and waiting on the second produced a 3-second spinner
// followed by "Google sign-in failed" on a link that could never succeed.
//
// The client can do better, because it can read the fragment. Return material is
// the part that cannot survive: GoTrue exchanges the tokens and cleans the URL
// on the first read, so once it is gone, the flow is over and re-running the
// exchange only burns the retry window and lands on the same failure.

// Implicit flow (the Supabase default, and what auth-js is configured for here):
// GoTrue returns the tokens in the fragment.
const IMPLICIT_TOKEN_KEYS = ["access_token", "refresh_token"];

export function hasOAuthReturnMaterial(hash = "", search = "") {
  const fragment = new URLSearchParams(String(hash).replace(/^#/, ""));
  if (IMPLICIT_TOKEN_KEYS.some((key) => fragment.get(key))) return true;

  // PKCE flow: a single-use `?code=` in the query. Without it there is nothing
  // to redeem, so this is not a return leg either.
  const query = new URLSearchParams(String(search).replace(/^\?/, ""));
  return Boolean(query.get("code"));
}

export function isOAuthReturn() {
  if (typeof window === "undefined") return false;
  return hasOAuthReturnMaterial(window.location.hash, window.location.search);
}

// A `?provider=...` marker with nothing to redeem behind it: a bookmark, a
// shared link, a reload after the tokens were already spent.
//
// Deliberately derived from the URL rather than latched into state, so it stays
// consistent across re-renders. That matters because the marker is left in
// place: the link is harmless now, and a link that still says `?provider=google`
// is much better than one that has to be cleaned up and then re-derives back to
// "spinner" on the next render.
export function isStaleProviderLink() {
  if (typeof window === "undefined") return false;
  if (!new URLSearchParams(window.location.search).has("provider")) return false;
  return !isOAuthReturn();
}
