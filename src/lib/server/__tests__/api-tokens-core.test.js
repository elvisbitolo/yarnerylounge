import test from "node:test";
import assert from "node:assert/strict";
import {
  TOKEN_PREFIX,
  MAX_TOKENS_PER_USER,
  READ_SCOPES,
  ALL_SCOPES,
  DEFAULT_SCOPES,
  isValidScope,
  normalizeScopes,
  hasScope,
  hashToken,
  generateApiToken,
  isApiTokenFormat,
  parseBearer,
  isExpired,
  isTokenUsable,
  serializeToken,
} from "../api-tokens-core.js";

const NOW = Date.parse("2026-10-01T12:00:00.000Z");

test("generateApiToken: token carries the prefix and a matching hash", () => {
  const { token, prefix, tokenHash } = generateApiToken();
  assert.ok(token.startsWith(TOKEN_PREFIX));
  assert.equal(tokenHash, hashToken(token));
  assert.notEqual(tokenHash, token);
  assert.ok(prefix.startsWith(TOKEN_PREFIX));
  assert.ok(token.startsWith(prefix));
  assert.equal(tokenHash.length, 64);
});

test("generateApiToken: two calls never collide", () => {
  const a = generateApiToken();
  const b = generateApiToken();
  assert.notEqual(a.token, b.token);
  assert.notEqual(a.tokenHash, b.tokenHash);
});

test("hashToken: deterministic and stable regardless of input shape", () => {
  assert.equal(hashToken("x"), hashToken("x"));
  assert.equal(hashToken(null), hashToken(""));
});

test("isApiTokenFormat: accepts our tokens and rejects others", () => {
  const { token } = generateApiToken();
  assert.equal(isApiTokenFormat(token), true);
  assert.equal(isApiTokenFormat("nope"), false);
  assert.equal(isApiTokenFormat(`${TOKEN_PREFIX}short`), false);
  assert.equal(isApiTokenFormat(null), false);
});

test("parseBearer: reads a well-formed Authorization header", () => {
  assert.equal(parseBearer("Bearer yry_live_abc"), "yry_live_abc");
  assert.equal(parseBearer("bearer yry_live_abc"), "yry_live_abc");
  assert.equal(parseBearer("Bearer   yry_live_abc  "), "yry_live_abc");
  assert.equal(parseBearer("Basic abc"), "");
  assert.equal(parseBearer(""), "");
  assert.equal(parseBearer(undefined), "");
});

test("scope catalog: read scopes are valid and defaults cover them", () => {
  assert.ok(READ_SCOPES.every(isValidScope));
  assert.deepEqual(ALL_SCOPES, READ_SCOPES);
  assert.deepEqual(DEFAULT_SCOPES, READ_SCOPES);
  assert.equal(isValidScope("read:secrets"), false);
  assert.equal(isValidScope(""), false);
});

test("normalizeScopes: drops unknown scopes and de-dupes", () => {
  assert.deepEqual(
    normalizeScopes(["read:posts", "read:posts", "write:posts", 5, null]),
    ["read:posts"]
  );
  assert.deepEqual(normalizeScopes(null), []);
  assert.deepEqual(normalizeScopes("read:posts"), []);
});

test("hasScope: matches an exact configured scope", () => {
  assert.equal(hasScope(["read:posts"], "read:posts"), true);
  assert.equal(hasScope(["read:posts"], "read:events"), false);
  assert.equal(hasScope([], "read:posts"), false);
  assert.equal(hasScope(["read:posts"], ""), true);
});

test("isExpired: null never expires, past expires, future does not", () => {
  assert.equal(isExpired(null, NOW), false);
  assert.equal(isExpired("2026-09-30T00:00:00.000Z", NOW), true);
  assert.equal(isExpired("2026-10-02T00:00:00.000Z", NOW), false);
  assert.equal(isExpired(new Date(NOW), NOW), true);
});

test("isTokenUsable: rejects revoked, expired and missing rows", () => {
  const base = { revokedAt: null, expiresAt: null };
  assert.equal(isTokenUsable(base, NOW), true);
  assert.equal(isTokenUsable({ ...base, revokedAt: new Date(NOW) }, NOW), false);
  assert.equal(isTokenUsable({ ...base, expiresAt: new Date(NOW - 1) }, NOW), false);
  assert.equal(isTokenUsable(null, NOW), false);
});

test("serializeToken: exposes metadata but never the hash or owner id", () => {
  const row = {
    id: "tok_1",
    userId: "u1",
    name: "My blog",
    prefix: "yry_live_ab12cd",
    tokenHash: "deadbeef",
    scopes: ["read:posts"],
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
  };
  const out = serializeToken(row);
  assert.equal(out.id, "tok_1");
  assert.equal(out.name, "My blog");
  assert.equal(out.prefix, "yry_live_ab12cd");
  assert.deepEqual(out.scopes, ["read:posts"]);
  assert.equal(out.createdAt, "2026-09-01T00:00:00.000Z");
  assert.equal(out.lastUsedAt, null);
  assert.equal(out.tokenHash, undefined);
  assert.equal(out.userId, undefined);
  assert.equal(serializeToken(null), null);
});

test("MAX_TOKENS_PER_USER is a sane positive cap", () => {
  assert.ok(Number.isInteger(MAX_TOKENS_PER_USER) && MAX_TOKENS_PER_USER > 0);
});
