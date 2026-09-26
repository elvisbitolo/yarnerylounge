import { test } from "node:test";
import assert from "node:assert/strict";
import * as vault from "../welcome-vault-core.js";
import {
  WELCOME_VAULT_ID,
  WELCOME_VAULT_AUTHOR_ID,
  WELCOME_VAULT_TEXT,
  welcomeVaultPostData,
} from "../welcome-vault-core.js";

// Post.authorId is NOT NULL with a foreign key to User, so the announcement
// cannot be created without an author. An earlier fix satisfied the constraint
// by inserting a synthetic "system" / "The Speakeasy Team" user, which put a
// fake member into the public directory, user autocomplete and the member
// counts. The correct fix is a nullable authorId, so nothing is invented.
test("no service account is fabricated for the announcement", () => {
  assert.equal(
    Object.keys(vault).includes("systemAuthorData"),
    false,
    "welcome-vault-core must not export a factory that builds a synthetic user"
  );
  assert.equal(WELCOME_VAULT_AUTHOR_ID, null);
  assert.equal(welcomeVaultPostData().authorId, null);
});

// The byline is a denormalized display string on the post. It is allowed, and it
// is not a member record.
test("the announcement keeps a byline without an author row", () => {
  const post = welcomeVaultPostData();
  assert.equal(post.authorName, "The Speakeasy Team");
  assert.equal(post.authorId, null);
  assert.equal(post.id, WELCOME_VAULT_ID);
  assert.equal(post.kind, "announcement");
  assert.equal(post.pinned, true);
  assert.equal(post.text, WELCOME_VAULT_TEXT);
});

test("the announcement is complete enough to render", () => {
  const post = welcomeVaultPostData();
  for (const key of ["authorName", "text", "pinnedAt", "lastActivityAt", "createdAt"]) {
    assert.ok(post[key], `${key} must be set`);
  }
  for (const key of ["hashtags", "likes", "bookmarks", "reactions"]) {
    assert.ok(post[key] && typeof post[key] === "object", `${key} must be an object, not undefined`);
  }
  assert.equal(post.commentCount, 0);
});

test("timestamps come from the injected clock so tests stay deterministic", () => {
  const now = new Date("2026-01-02T03:04:05.000Z");
  const post = welcomeVaultPostData(now);
  assert.equal(post.createdAt, now);
  assert.equal(post.pinnedAt, now);
  assert.equal(post.lastActivityAt, now);
});
