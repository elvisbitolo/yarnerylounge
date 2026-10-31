import { test } from "node:test";
import assert from "node:assert/strict";
import { provisionNewMember } from "../prepaid-membership.js";

function makePrisma({ prepaid = null, racedMember = null } = {}) {
  const calls = [];
  const tx = {
    user: {
      findUnique: async (args) => {
        calls.push(["user.findUnique", args]);
        return racedMember;
      },
      findFirst: async (args) => {
        calls.push(["user.findFirst", args]);
        return prepaid;
      },
      create: async (args) => {
        calls.push(["user.create", args]);
        return { ...args.data };
      },
      delete: async (args) => calls.push(["user.delete", args]),
    },
    subscription: {
      upsert: async (args) => calls.push(["subscription.upsert", args]),
      delete: async (args) => calls.push(["subscription.delete", args]),
    },
  };
  const prisma = {
    $transaction: async (callback) => callback(tx),
  };
  return { prisma, calls };
}

const identity = {
  uid: "supabase-user-123",
  email: "Buyer@Example.com",
  photoURL: "https://example.com/avatar.png",
};

test("claims a prepaid Shopify placeholder and transfers its existing subscription", async () => {
  const expiresAt = new Date("2026-11-30T00:00:00.000Z");
  const prepaid = {
    id: "buyer@example.com",
    email: "buyer@example.com",
    name: "Buyer",
    plan: "hooking-up",
    role: "member",
    paymentStatus: "paid",
    isPrePaid: true,
    shopifyCustomerId: "customer-42",
    shopifyOrderId: "order-99",
    expiresAt,
    subscription: {
      provider: "shopify",
      status: "active",
      plan: "monthly",
      planName: "hooking-up",
      tier: "hooking-up",
      role: "member",
      shopifyCustomerId: "customer-42",
      shopifyOrderId: "order-99",
      currentPeriodEnd: expiresAt,
    },
  };
  const { prisma, calls } = makePrisma({ prepaid });

  const result = await provisionNewMember({
    prisma,
    identity,
    memberName: "Buyer",
    prepaidEmail: "buyer@example.com",
    openAccess: false,
    openAccessPlan: "flirting",
  });

  assert.equal(result.created, true);
  assert.equal(result.member.id, identity.uid);
  const create = calls.find(([name]) => name === "user.create")[1].data;
  assert.equal(create.plan, "hooking-up");
  assert.equal(create.paymentStatus, "paid");
  assert.equal(create.isPrePaid, false);
  assert.equal(create.shopifyCustomerId, "customer-42");
  assert.equal(create.shopifyOrderId, "order-99");
  assert.equal(create.expiresAt, expiresAt);

  const upsert = calls.find(([name]) => name === "subscription.upsert")[1];
  assert.equal(upsert.where.id, identity.uid);
  assert.equal(upsert.create.userId, identity.uid);
  assert.equal(upsert.create.provider, "shopify");
  assert.equal(upsert.create.tier, "hooking-up");
  assert.equal(upsert.create.shopifyOrderId, "order-99");
  assert.deepEqual(calls.find(([name]) => name === "subscription.delete")[1], {
    where: { id: prepaid.id },
  });
  assert.deepEqual(calls.find(([name]) => name === "user.delete")[1], {
    where: { id: prepaid.id },
  });
});

test("backfills a Shopify subscription for a legacy prepaid placeholder without one", async () => {
  const expiresAt = new Date("2026-11-30T00:00:00.000Z");
  const prepaid = {
    id: "buyer@example.com",
    email: "buyer@example.com",
    plan: "moving-in",
    role: "host",
    paymentStatus: "paid",
    isPrePaid: true,
    shopifyCustomerId: "customer-77",
    shopifyOrderId: "order-100",
    expiresAt,
    subscription: null,
  };
  const { prisma, calls } = makePrisma({ prepaid });

  const result = await provisionNewMember({
    prisma,
    identity,
    memberName: "Buyer",
    prepaidEmail: "buyer@example.com",
    openAccess: false,
    openAccessPlan: "flirting",
  });

  assert.equal(result.member.plan, "moving-in");
  const upsert = calls.find(([name]) => name === "subscription.upsert")[1];
  assert.equal(upsert.create.provider, "shopify");
  assert.equal(upsert.create.status, "active");
  assert.equal(upsert.create.tier, "moving-in");
  assert.equal(upsert.create.role, "host");
  assert.equal(upsert.create.shopifyCustomerId, "customer-77");
  assert.equal(upsert.create.shopifyOrderId, "order-100");
  assert.equal(upsert.create.currentPeriodEnd, expiresAt);
  assert.equal(calls.some(([name]) => name === "subscription.delete"), false);
  assert.deepEqual(calls.find(([name]) => name === "user.delete")[1], {
    where: { id: prepaid.id },
  });
});

test("creates a normal Flirting account when no prepaid placeholder exists", async () => {
  const { prisma, calls } = makePrisma();
  const result = await provisionNewMember({
    prisma,
    identity,
    memberName: "Buyer",
    prepaidEmail: "buyer@example.com",
    openAccess: false,
    openAccessPlan: "flirting",
  });

  assert.equal(result.created, true);
  assert.equal(result.member.plan, "flirting");
  assert.equal(result.member.paymentStatus, "unpaid");
  assert.equal(calls.some(([name]) => name === "subscription.upsert"), false);
  assert.equal(calls.some(([name]) => name === "user.delete"), false);
});

test("reuses a member created by a concurrent signup without claiming twice", async () => {
  const racedMember = { id: identity.uid, plan: "hooking-up" };
  const { prisma, calls } = makePrisma({ racedMember });

  const result = await provisionNewMember({
    prisma,
    identity,
    memberName: "Buyer",
    prepaidEmail: "buyer@example.com",
    openAccess: false,
    openAccessPlan: "flirting",
  });

  assert.equal(result.created, false);
  assert.equal(result.member, racedMember);
  assert.equal(calls.some(([name]) => name === "user.create"), false);
  assert.equal(calls.some(([name]) => name === "subscription.upsert"), false);
});
