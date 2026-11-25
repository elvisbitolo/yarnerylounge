import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateInviteToken,
  isExpired,
  mapInviteRow,
  mapPublicInvite,
  createInvite,
  listInvites,
  getPublicInvite,
  claimInvite,
  revokeInvite,
  rewardActivation,
  INVITE_TTL_MS,
  RECIPIENT_NAME_MAX,
  INVITE_MESSAGE_MAX,
  MAX_OUTSTANDING_INVITES,
  MAX_INVITES_PER_DAY,
} from "../invites-core.js";

function baseRow(over = {}) {
  return {
    id: "in1",
    token: "tok-123",
    inviterUid: "u-inviter",
    recipientName: "Sarah",
    message: "Come join us!",
    status: "pending",
    expiresAt: new Date(Date.now() + 86400000),
    acceptedAt: null,
    acceptedUid: null,
    activatedAt: null,
    createdAt: new Date(Date.now() - 3600000),
    ...over,
  };
}

function fakePrisma(over = {}) {
  return {
    invitation: {
      findUnique: async () => null,
      findFirst: async () => null,
      findMany: async () => [],
      count: async () => 0,
      create: async (args) => ({ ...args.data, id: "in-new" }),
      update: async (args) => ({ ...baseRow(), ...args.data }),
      updateMany: async () => ({ count: 0 }),
      ...(over.invitation || {}),
    },
    user: {
      findUnique: async () => null,
      ...(over.user || {}),
    },
    ...(over.other || {}),
  };
}

test("generateInviteToken: url-safe, unique, fixed length", () => {
  const a = generateInviteToken();
  const b = generateInviteToken();
  assert.equal(a.length, 24);
  assert.ok(a !== b);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
});

test("isExpired: pending invite past its deadline is expired", () => {
  assert.equal(
    isExpired(baseRow({ expiresAt: new Date(Date.now() - 1000) })),
    true
  );
  assert.equal(
    isExpired(baseRow({ expiresAt: new Date(Date.now() + 1000) })),
    false
  );
});

test("isExpired: accepted/revoked invites never read as expired", () => {
  const past = new Date(Date.now() - 1000);
  assert.equal(isExpired(baseRow({ status: "accepted", acceptedAt: past, expiresAt: past })), false);
  assert.equal(isExpired(baseRow({ status: "revoked", expiresAt: past })), false);
});

test("isExpired: a null deadline never forces expiry", () => {
  assert.equal(isExpired(baseRow({ expiresAt: null })), false);
});

test("mapInviteRow: maps a row and derives expired", () => {
  const row = baseRow({ status: "accepted", acceptedAt: new Date(Date.now() - 500) });
  const mapped = mapInviteRow(row);
  assert.equal(mapped.id, "in1");
  assert.equal(mapped.token, "tok-123");
  assert.equal(mapped.inviterUid, "u-inviter");
  assert.equal(mapped.recipientName, "Sarah");
  assert.equal(mapped.message, "Come join us!");
  assert.equal(mapped.status, "accepted");
  assert.equal(mapped.acceptedUid, "");
  assert.equal(mapped.expired, false);
  assert.ok(mapped.createdAt instanceof Date);
});

test("mapPublicInvite: leaks no token or inviter/acceptance identity", () => {
  const row = baseRow({
    status: "accepted",
    acceptedAt: new Date(),
    acceptedUid: "u-claimer",
  });
  const pub = mapPublicInvite(row);
  assert.equal(pub.token, undefined);
  assert.equal(pub.inviterUid, undefined);
  assert.equal(pub.acceptedUid, undefined);
  assert.equal(pub.recipientName, "Sarah");
  assert.equal(pub.message, "Come join us!");
  assert.equal(pub.status, "accepted");
  assert.equal(pub.expired, false);
});

test("createInvite: rejects an over-long recipient name", async () => {
  const prisma = fakePrisma();
  const result = await createInvite({
    prisma,
    inviterUid: "u1",
    recipientName: "x".repeat(RECIPIENT_NAME_MAX + 1),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "recipient_name_too_long");
});

test("createInvite: rejects an over-long message", async () => {
  const prisma = fakePrisma();
  const result = await createInvite({
    prisma,
    inviterUid: "u1",
    message: "x".repeat(INVITE_MESSAGE_MAX + 1),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "message_too_long");
});

test("createInvite: caps outstanding pending invites per member", async () => {
  let created = false;
  const prisma = fakePrisma({
    invitation: {
      count: async ({ where }) => {
        if (where.status === "pending") return MAX_OUTSTANDING_INVITES;
        return 0;
      },
      create: async () => {
        created = true;
        return {};
      },
    },
  });
  const result = await createInvite({ prisma, inviterUid: "u1" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "invite_limit");
  assert.equal(created, false);
});

test("createInvite: caps invites per day", async () => {
  let created = false;
  const prisma = fakePrisma({
    invitation: {
      count: async ({ where }) => (where.createdAt ? MAX_INVITES_PER_DAY : 0),
      create: async () => {
        created = true;
        return {};
      },
    },
  });
  const result = await createInvite({ prisma, inviterUid: "u1" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "daily_limit");
  assert.equal(created, false);
});

test("createInvite: creates a pending invite with a week-long token", async () => {
  let captured;
  const prisma = fakePrisma({
    invitation: {
      create: async (args) => {
        captured = args.data;
        return { ...args.data, id: "in-new" };
      },
    },
  });
  const result = await createInvite({
    prisma,
    inviterUid: "u1",
    recipientName: "  Nash  ",
    message: " join us! ",
  });
  assert.equal(result.ok, true);
  assert.equal(result.invite.status, "pending");
  assert.equal(captured.inviterUid, "u1");
  assert.equal(captured.recipientName, "Nash");
  assert.equal(captured.message, "join us!");
  const ttl = new Date(captured.expiresAt).getTime() - Date.now();
  assert.ok(Math.abs(ttl - INVITE_TTL_MS) < 2000);
  assert.ok(result.invite.token.length > 0);
});

test("listInvites: maps all rows newest-first order already applied", async () => {
  const prisma = fakePrisma({
    invitation: {
      findMany: async () => [baseRow({ id: "in2" }), baseRow({ id: "in1" })],
    },
  });
  const invites = await listInvites({ prisma, inviterUid: "u1" });
  assert.equal(invites.length, 2);
  assert.equal(invites[0].id, "in2");
});

test("getPublicInvite: attaches the inviter's name and photo", async () => {
  const prisma = fakePrisma({
    invitation: {
      findUnique: async () => ({
        ...baseRow(),
        inviter: { id: "u-inviter", name: "Elena", photoURL: "https://example.com/e.png" },
      }),
    },
  });
  const invite = await getPublicInvite({ prisma, token: "tok-123" });
  assert.equal(invite.inviter.name, "Elena");
  assert.equal(invite.inviter.photoURL, "https://example.com/e.png");
  assert.equal(invite.token, undefined);
});

test("getPublicInvite: returns null when the token is unknown", async () => {
  const invite = await getPublicInvite({ prisma: fakePrisma(), token: "nope" });
  assert.equal(invite, null);
});

test("claimInvite: unknown token", async () => {
  const result = await claimInvite({ prisma: fakePrisma(), token: "nope", claimerUid: "u2" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "not_found");
});

test("claimInvite: you cannot claim your own invite", async () => {
  const prisma = fakePrisma({
    invitation: { findUnique: async () => baseRow() },
  });
  const result = await claimInvite({ prisma, token: "tok-123", claimerUid: "u-inviter" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "self_invite");
});

test("claimInvite: revoked invites are unclaimable", async () => {
  const prisma = fakePrisma({
    invitation: { findUnique: async () => baseRow({ status: "revoked" }) },
  });
  const result = await claimInvite({ prisma, token: "tok-123", claimerUid: "u2" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "revoked");
});

test("claimInvite: already-accepted invites are single-use", async () => {
  const prisma = fakePrisma({
    invitation: {
      findUnique: async () =>
        baseRow({ status: "accepted", acceptedUid: "u-previous", acceptedAt: new Date() }),
    },
  });
  const result = await claimInvite({ prisma, token: "tok-123", claimerUid: "u2" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "already_claimed");
});

test("claimInvite: expired invites are unclaimable", async () => {
  const prisma = fakePrisma({
    invitation: {
      findUnique: async () => baseRow({ expiresAt: new Date(Date.now() - 1000) }),
    },
  });
  const result = await claimInvite({ prisma, token: "tok-123", claimerUid: "u2" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "expired");
});

test("claimInvite: marks the invite accepted for the claimer", async () => {
  let updated;
  const prisma = fakePrisma({
    invitation: {
      findUnique: async () => baseRow(),
      update: async (args) => {
        updated = args;
        return { ...baseRow(), ...args.data };
      },
    },
  });
  const result = await claimInvite({ prisma, token: "tok-123", claimerUid: "u2" });
  assert.equal(result.ok, true);
  assert.equal(result.invite.status, "accepted");
  assert.equal(result.invite.acceptedUid, "u2");
  assert.equal(result.invite.expired, false);
  assert.equal(updated.where.id, "in1");
  assert.equal(updated.data.status, "accepted");
  assert.equal(updated.data.acceptedUid, "u2");
});

test("revokeInvite: only the inviter can revoke", async () => {
  let updated = null;
  const prisma = fakePrisma({
    invitation: {
      findUnique: async () => baseRow({ inviterUid: "u-other" }),
      update: async (args) => {
        updated = args;
        return {};
      },
    },
  });
  const result = await revokeInvite({ prisma, token: "tok-123", inviterUid: "u1" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "not_found");
  assert.equal(updated, null);
});

test("revokeInvite: accepted invites cannot be revoked", async () => {
  const prisma = fakePrisma({
    invitation: {
      findUnique: async () => baseRow({ status: "accepted", acceptedUid: "u2" }),
    },
  });
  const result = await revokeInvite({ prisma, token: "tok-123", inviterUid: "u-inviter" });
  assert.equal(result.ok, false);
  assert.equal(result.error, "already_claimed");
});

test("revokeInvite: revokes a pending invite", async () => {
  let updated;
  const prisma = fakePrisma({
    invitation: {
      findUnique: async () => baseRow(),
      update: async (args) => {
        updated = args;
        return {};
      },
    },
  });
  const result = await revokeInvite({ prisma, token: "tok-123", inviterUid: "u-inviter" });
  assert.equal(result.ok, true);
  assert.equal(updated.data.status, "revoked");
});

test("rewardActivation: no op when the author joined without an invite", async () => {
  let credited = false;
  const result = await rewardActivation({
    prisma: fakePrisma(),
    authorUid: "u-fresh",
    credit: async () => {
      credited = true;
    },
  });
  assert.equal(result.rewarded, false);
  assert.equal(credited, false);
});

test("rewardActivation: pays both sides once on the first post", async () => {
  const calls = [];
  const prisma = fakePrisma({
    invitation: {
      findFirst: async () => baseRow({ acceptedUid: "u-fresh", inviterUid: "u-inviter" }),
      updateMany: async () => ({ count: 1 }),
    },
    user: {
      findUnique: async () => ({ name: "Elena" }),
    },
  });
  const result = await rewardActivation({
    prisma,
    authorUid: "u-fresh",
    credit: async (inviterUid, authorUid, inviterName) => {
      calls.push([inviterUid, authorUid, inviterName]);
    },
  });
  assert.equal(result.rewarded, true);
  assert.deepEqual(calls, [["u-inviter", "u-fresh", "Elena"]]);
});

test("rewardActivation: racing double-publish pays once", async () => {
  let credited = false;
  const prisma = fakePrisma({
    invitation: {
      findFirst: async () => baseRow({ acceptedUid: "u-fresh", inviterUid: "u-inviter" }),
      // A concurrent request already set activatedAt, so our conditional update matched 0 rows.
      updateMany: async () => ({ count: 0 }),
    },
    user: {
      findUnique: async () => ({ name: "Elena" }),
    },
  });
  const result = await rewardActivation({
    prisma,
    authorUid: "u-fresh",
    credit: async () => {
      credited = true;
    },
  });
  assert.equal(result.rewarded, false);
  assert.equal(credited, false);
});