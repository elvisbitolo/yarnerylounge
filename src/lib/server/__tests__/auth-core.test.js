import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseJwtPayload,
  supabaseProjectRef,
  isSupabaseAccessJwt,
  serializeSessionCookie,
  parseSessionCookie,
  mapSupabaseUser,
  identityFromAccessToken,
  SESSION_MAX_AGE_SECONDS,
} from "../auth-core.js";

function makeAccessJwt(ref = "pwdopgyvkfsxxcuanoml", role = "authenticated", iss = `https://${ref}.supabase.co/auth/v1`, extra = {}) {
  const payload = Buffer.from(JSON.stringify({ iss, ref, role, iat: 1788743998, exp: 2104319998, ...extra })).toString(
    "base64url"
  );
  return `not.${payload}.sig`;
}

test("parseJwtPayload decodes the unverified claims", () => {
  const claims = parseJwtPayload(makeAccessJwt());
  assert.ok(claims);
  assert.equal(claims.iss, "https://pwdopgyvkfsxxcuanoml.supabase.co/auth/v1");
  assert.equal(claims.role, "authenticated");
  assert.equal(claims.ref, "pwdopgyvkfsxxcuanoml");
});

test("parseJwtPayload rejects malformed tokens", () => {
  assert.equal(parseJwtPayload(null), null);
  assert.equal(parseJwtPayload(""), null);
  assert.equal(parseJwtPayload("only.two"), null);
  assert.equal(parseJwtPayload("a.b.notjson"), null);
  assert.equal(parseJwtPayload(123), null);
});

test("supabaseProjectRef extracts the subdomain", () => {
  assert.equal(supabaseProjectRef("https://pwdopgyvkfsxxcuanoml.supabase.co"), "pwdopgyvkfsxxcuanoml");
  assert.equal(supabaseProjectRef(""), "");
  process.env.SUPABASE_URL = "https://abc123.supabase.co";
  assert.equal(supabaseProjectRef(), "abc123");
  delete process.env.SUPABASE_URL;
});

test("isSupabaseAccessJwt accepts matching access tokens", () => {
  const token = makeAccessJwt();
  assert.equal(isSupabaseAccessJwt(token, "pwdopgyvkfsxxcuanoml"), true);
  assert.equal(isSupabaseAccessJwt(token), true);
});

test("isSupabaseAccessJwt rejects wrong role, ref or garbage", () => {
  assert.equal(isSupabaseAccessJwt(makeAccessJwt("pwdopgyvkfsxxcuanoml", "service_role"), "pwdopgyvkfsxxcuanoml"), false);
  assert.equal(isSupabaseAccessJwt(makeAccessJwt("pwdopgyvkfsxxcuanoml", "anon"), "pwdopgyvkfsxxcuanoml"), false);
  assert.equal(isSupabaseAccessJwt(makeAccessJwt("abc", "authenticated"), "pwdopgyvkfsxxcuanoml"), false);
  assert.equal(isSupabaseAccessJwt(makeAccessJwt("pwdopgyvkfsxxcuanoml", "authenticated", "https://other.supabase.co/auth/v1"), "pwdopgyvkfsxxcuanoml"), false);
  assert.equal(isSupabaseAccessJwt(null), false);
  assert.equal(isSupabaseAccessJwt("not.a.jwt"), false);
});

test("session cookie serialization round-trips the opaque sid", () => {
  const cookie = serializeSessionCookie("sid-123");
  assert.deepEqual(parseSessionCookie(cookie), { sid: "sid-123" });
});

test("parseSessionCookie rejects legacy and malformed cookies", () => {
  assert.equal(parseSessionCookie('{"v":1,"a":"abc","r":"refresh"}'), null);
  assert.equal(parseSessionCookie("eyJfbGFjeS1sZWdhY3ktZmlyZWJhc2U"), null);
  assert.equal(parseSessionCookie("{not json"), null);
  assert.equal(parseSessionCookie('{"v":2,"s":""}'), null);
  assert.equal(parseSessionCookie('{"v":1,"s":"sid"}'), null);
  assert.equal(parseSessionCookie(""), null);
  assert.equal(parseSessionCookie(null), null);
});

test("identityFromAccessToken maps claims to the identity shape", () => {
  const token = makeAccessJwt("pwdopgyvkfsxxcuanoml", "authenticated", `https://pwdopgyvkfsxxcuanoml.supabase.co/auth/v1`, {
    sub: "uuid-1",
    email: "Sam@Example.com",
    email_verified: true,
    user_metadata: { name: "Sam", avatar_url: "https://img/a.png" },
  });
  const identity = identityFromAccessToken(token);
  assert.equal(identity.uid, "uuid-1");
  assert.equal(identity.email, "Sam@Example.com");
  assert.equal(identity.email_verified, true);
  assert.equal(identity.name, "Sam");
  assert.equal(identity.photoURL, "https://img/a.png");
  assert.equal(identity.role, "member");
});

test("identityFromAccessToken handles unverified + metadata-less claims", () => {
  const token = makeAccessJwt("pwdopgyvkfsxxcuanoml", "authenticated", `https://pwdopgyvkfsxxcuanoml.supabase.co/auth/v1`, {
    sub: "uuid-2",
    email: "jo@ex.com",
    email_verified: false,
    user_metadata: {},
  });
  const identity = identityFromAccessToken(token);
  assert.equal(identity.uid, "uuid-2");
  assert.equal(identity.email_verified, false);
  assert.equal(identity.name, "jo");
  assert.equal(identity.photoURL, "");
});

test("identityFromAccessToken tolerates missing sub and garbage", () => {
  const noSub = makeAccessJwt("pwdopgyvkfsxxcuanoml", "authenticated", `https://pwdopgyvkfsxxcuanoml.supabase.co/auth/v1`, {
    email: "jo@ex.com",
  });
  assert.equal(identityFromAccessToken(noSub), null);
  assert.equal(identityFromAccessToken(null), null);
  assert.equal(identityFromAccessToken("not.a.jwt"), null);
});

test("SESSION_MAX_AGE_SECONDS is the rolling 14-day window", () => {
  assert.equal(SESSION_MAX_AGE_SECONDS, 60 * 60 * 24 * 14);
});

test("mapSupabaseUser produces the expected identity shape", () => {
  const user = {
    id: "uuid-1",
    email: "Sam@Example.com",
    email_confirmed_at: "2025-01-01T00:00:00Z",
    user_metadata: { name: "Sam", avatar_url: "https://img/a.png" },
  };
  const mapped = mapSupabaseUser(user);
  assert.equal(mapped.uid, "uuid-1");
  assert.equal(mapped.email, "Sam@Example.com");
  assert.equal(mapped.email_verified, true);
  assert.equal(mapped.name, "Sam");
  assert.equal(mapped.photoURL, "https://img/a.png");
  assert.equal(mapped.role, "member");
});

test("mapSupabaseUser covers unverified + metadata-less users", () => {
  const mapped = mapSupabaseUser({ id: "uuid-2", email: "jo@ex.com", user_metadata: {} });
  assert.equal(mapped.email_verified, false);
  assert.equal(mapped.name, "jo");
  assert.equal(mapped.photoURL, "");
});

test("mapSupabaseUser uses Supabase uid, not legacy firebase_uid", () => {
  const mapped = mapSupabaseUser({
    id: "supabase-uuid-9",
    email: "sam@example.com",
    email_confirmed_at: "2025-01-01T00:00:00Z",
    user_metadata: { name: "Sam" },
    app_metadata: { firebase_uid: "ignored-legacy-uid" },
  });
  assert.equal(mapped.uid, "supabase-uuid-9");
  assert.equal(mapped.email_verified, true);
});

test("mapSupabaseUser tolerates null", () => {
  assert.equal(mapSupabaseUser(null), null);
  assert.equal(mapSupabaseUser(undefined), null);
});