import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WELCOME_VAULT_ID,
  SYSTEM_AUTHOR_ID,
  WELCOME_VAULT_TEXT,
  systemAuthorData,
  welcomeVaultPostData,
} from "../welcome-vault-core.js";

// Post.authorId is a NOT NULL foreign key to User, so the announcement can only
// exist once the "system" author row does. Seeding the post without it fails on
// Post_authorId_fkey, which is caught and logged as welcome-vault.seed_failed --
// a silent failure that left the Terms of Service post missing entirely.
test("the system author row matches the sentinel the post references", () => {
  const author = systemAuthorData();
  assert.equal(author.id, SYSTEM_AUTHOR_ID);
  assert.ok(author.name, "the author needs a display name");
  assert.equal(author.id, welcomeVaultPostData().authorId);
});

test("the announcement uses the sentinel authorId the Feed keys on", () => {
  const post = welcomeVaultPostData();
  // Feed.js:1423,1432,1444,1472 hide the delete menu, comment box and edit
  // affordances for authorId "system". Any other value makes the read-only
  // Terms post editable by its author or by moderators.
  assert.equal(post.authorId, "system");
  assert.equal(post.kind, "announcement");
  assert.equal(post.pinned, true);
  assert.equal(post.id, WELCOME_VAULT_ID);
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
