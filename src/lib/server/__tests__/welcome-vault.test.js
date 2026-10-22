import { test } from "node:test";
import assert from "node:assert/strict";
import * as vault from "../welcome-vault-core.js";
import {
  WELCOME_VAULT_ID,
  WELCOME_VAULT_AUTHOR_ID,
  WELCOME_VAULT_TEXT,
  welcomeVaultPostData,
  ensureWelcomeVaultPostWith,
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

// A stand-in for the prisma client, recording every write so the tests can
// assert on what the seeding path does and does not touch.
function fakePrisma({ existing = null } = {}) {
  const calls = { create: [], update: [], userWrites: [] };
  return {
    calls,
    post: {
      findUnique: async () => existing,
      create: async ({ data }) => {
        calls.create.push(data);
        return data;
      },
      update: async ({ where, data }) => {
        calls.update.push({ where, data });
        return { ...where, ...data };
      },
    },
    user: {
      upsert: async (args) => {
        calls.userWrites.push(args);
        return args;
      },
      create: async (args) => {
        calls.userWrites.push(args);
        return args;
      },
    },
  };
}

test("the announcement is created without an author row", async () => {
  const prisma = fakePrisma();
  const result = await ensureWelcomeVaultPostWith(prisma);

  assert.deepEqual(result, { ok: true, id: WELCOME_VAULT_ID });
  assert.equal(prisma.calls.create.length, 1);
  assert.equal(prisma.calls.create[0].authorId, null);
  assert.equal(prisma.calls.create[0].kind, "announcement");
  assert.equal(prisma.calls.create[0].pinned, true);
});

test("seeding never writes to the User table", async () => {
  const prisma = fakePrisma();
  await ensureWelcomeVaultPostWith(prisma);

  assert.deepEqual(
    prisma.calls.userWrites,
    [],
    "the announcement must not fabricate a member row"
  );
});

test("a lost race to create the announcement is not an error", async () => {
  const prisma = fakePrisma();
  prisma.post.create = async () => {
    const err = new Error("Unique constraint failed on the fields: (`id`)");
    err.code = "P2002";
    throw err;
  };
  const result = await ensureWelcomeVaultPostWith(prisma);

  assert.deepEqual(result, { ok: true, id: WELCOME_VAULT_ID });
});

test("a legacy system-authored announcement is repointed to no author", async () => {
  const prisma = fakePrisma({
    existing: {
      id: WELCOME_VAULT_ID,
      pinned: true,
      pinnedAt: new Date("2026-01-01"),
      text: WELCOME_VAULT_TEXT,
      authorId: "system",
    },
  });
  const result = await ensureWelcomeVaultPostWith(prisma);

  assert.deepEqual(result, { ok: true, id: WELCOME_VAULT_ID });
  assert.equal(prisma.calls.create.length, 0);
  assert.equal(prisma.calls.update.length, 1);
  assert.equal(prisma.calls.update[0].data.authorId, null);
});

test("a healthy announcement is left alone", async () => {
  const prisma = fakePrisma({
    existing: {
      id: WELCOME_VAULT_ID,
      pinned: true,
      pinnedAt: new Date("2026-01-01"),
      text: WELCOME_VAULT_TEXT,
      authorId: null,
    },
  });
  const result = await ensureWelcomeVaultPostWith(prisma);

  assert.deepEqual(result, { ok: true, id: WELCOME_VAULT_ID });
  assert.equal(prisma.calls.create.length, 0);
  assert.equal(prisma.calls.update.length, 0);
});

test("an unpinned or edited announcement is repaired", async () => {
  const prisma = fakePrisma({
    existing: {
      id: WELCOME_VAULT_ID,
      pinned: false,
      pinnedAt: null,
      text: "something else",
      authorId: null,
    },
  });
  const now = new Date("2026-01-02T03:04:05.000Z");
  await ensureWelcomeVaultPostWith(prisma, now);

  assert.equal(prisma.calls.update.length, 1);
  const patch = prisma.calls.update[0].data;
  assert.equal(patch.pinned, true);
  assert.equal(patch.pinnedAt, now);
  assert.equal(patch.text, WELCOME_VAULT_TEXT);
});

test("a failing database is reported instead of thrown", async () => {
  const prisma = fakePrisma();
  prisma.post.findUnique = async () => {
    throw new Error("boom");
  };
  const result = await ensureWelcomeVaultPostWith(prisma);

  assert.equal(result.ok, false);
  assert.equal(result.error, "boom");
});

test("a missing database is reported", async () => {
  const result = await ensureWelcomeVaultPostWith(null);
  assert.deepEqual(result, { ok: false, error: "No database" });
});
