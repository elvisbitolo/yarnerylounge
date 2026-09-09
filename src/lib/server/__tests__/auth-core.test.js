import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseJwtPayload,
  supabaseProjectRef,
  isSupabaseAccessJwt,
  serializeSupabaseCookie,
  parseSessionCookie,
  mapSupabaseUser,
} from "../auth-core.js";

function makeAccessJwt(ref = "pwdopgyvkfsxxcuanoml", role = "authenticated", iss = `https://${ref}.supabase.co/auth/v1`) {
  const payload = Buffer.from(JSON.stringify({ iss, ref, role, iat: 1788743998, exp: 2104319998 })).toString(
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

test("session cookie serialization round-trips", () => {
  const cookie = serializeSupabaseCookie({ access: "abc.def.ghi", refresh: "refresh-token" });
  assert.deepEqual(parseSessionCookie(cookie), { access: "abc.def.ghi", refresh: "refresh-token" });
});

test("parseSessionCookie tolerates no refresh and legacy cookies", () => {
  const cookie = serializeSupabaseCookie({ access: "abc" });
  assert.deepEqual(parseSessionCookie(cookie), { access: "abc", refresh: null });
  assert.equal(parseSessionCookie("eyJfbGFjeS1sZWdhY3ktZmlyZWJhc2U"), null);
  assert.equal(parseSessionCookie("{not json"), null);
  assert.equal(parseSessionCookie(""), null);
  assert.equal(parseSessionCookie(null), null);
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

test("mapSupabaseUser resolves a migrated member's original uid", () => {
  const mapped = mapSupabaseUser({
    id: "supabase-uuid-9",
    email: "sam@example.com",
    email_confirmed_at: "2025-01-01T00:00:00Z",
    user_metadata: { name: "Sam" },
    app_metadata: { firebase_uid: "legacy-firebase-uid" },
  });
  assert.equal(mapped.uid, "legacy-firebase-uid");
  assert.equal(mapped.email_verified, true);
});

test("mapSupabaseUser tolerates null", () => {
  assert.equal(mapSupabaseUser(null), null);
  assert.equal(mapSupabaseUser(undefined), null);
});