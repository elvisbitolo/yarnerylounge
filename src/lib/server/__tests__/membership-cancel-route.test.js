import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const state = {};

class ShopifyCustomerErrorStub extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const json = (body, init = {}) => {
  const status = init.status ?? 200;
  return { body, status, ok: status >= 200 && status < 300 };
};

const stubs = {
  "next/server": { NextResponse: { json } },
  "@/lib/server/authorize": {
    requireUser: async () => state.auth,
    guardJson: (result) => (result.ok ? null : json({ error: result.error }, { status: result.status })),
  },
  "@/lib/db/prisma": { getPrisma: () => state.prisma },
  "@/lib/server/shopify": { roleAfterRevoke: () => "member" },
  "@/lib/server/log": {
    logError: (...args) => state.logs.push(args),
    logInfo: (...args) => state.logs.push(args),
  },
  "@/lib/server/shopify-customer.js": {
    ShopifyCustomerError: ShopifyCustomerErrorStub,
    isShopifyCustomerConfigured: () => state.shopify.configured,
    resolveShopifyAccessToken: async () => {
      state.events.push("resolve");
      if (state.shopify.error) throw state.shopify.error;
      return "access-token";
    },
    fetchShopifyCustomerProfile: async () => {
      state.events.push("profile");
      return state.shopify.profile;
    },
    cancelShopifyContracts: async (args) => {
      state.events.push("cancel");
      state.cancelArgs = args;
      return state.shopify.cancelResult;
    },
  },
  "@/lib/server/shopify-customer-core.js": {
    selectCancellableContracts: (nodes) => nodes,
  },
};

function stubSource(name) {
  return Object.entries(stubs[name])
    .map(([key, value]) =>
      key === "default"
        ? `export default globalThis.__stubs[${JSON.stringify(name)}].default;`
        : `export const ${key} = globalThis.__stubs[${JSON.stringify(name)}][${JSON.stringify(key)}];`
    )
    .join("\n");
}

globalThis.__stubs = stubs;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(stubs, specifier)) {
      return { url: `stub:${encodeURIComponent(specifier)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("stub:")) {
      return {
        format: "module",
        source: stubSource(decodeURIComponent(url.slice(5))),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const { POST } = await import("../../../app/api/membership/cancel/route.js");

beforeEach(() => {
  Object.assign(state, {
    auth: {
      ok: true,
      user: { uid: "member-uid" },
      userDoc: { role: "member", name: "Member", email: "member@example.test" },
    },
    audit: null,
    body: { reason: "not_using", note: "No longer needed" },
    cancelArgs: null,
    events: [],
    logs: [],
    existing: {
      id: "member-uid",
      name: "Member",
      email: "member@example.test",
      role: "member",
      plan: "hooking-up",
      shopifyCustomerId: null,
      shopifyOrderId: null,
    },
    shopify: {
      configured: true,
      error: null,
      profile: {
        customer: { id: "gid://shopify/Customer/123" },
        contractNodes: [{ id: "gid://shopify/SubscriptionContract/1", status: "ACTIVE" }],
      },
      cancelResult: { canceled: 1, skipped: 0 },
    },
  });

  state.prisma = {
    user: {
      findUnique: async () => state.existing,
    },
    $transaction: async (fn) =>
      fn({
        user: {
          update: async () => {
            state.events.push("localUpdate");
          },
        },
        auditLog: {
          create: async (args) => {
            state.events.push("audit");
            state.audit = args;
          },
        },
        subscription: {
          upsert: async () => {
            state.events.push("subscription");
          },
        },
      }),
  };
});

const req = {
  nextUrl: { origin: "https://www.christasspeakeasy.com" },
  json: async () => state.body,
};

test("cancel Shopify contracts before revoking local access", async () => {
  const response = await POST(req);

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.match(response.body.message, /recurring billing are cancelled/);
  assert.doesNotMatch(response.body.message, /Shopify is opening/);
  assert.deepEqual(state.events, ["resolve", "profile", "cancel", "localUpdate", "audit", "subscription"]);
  assert.equal(state.cancelArgs.origin, "https://www.christasspeakeasy.com");
  assert.deepEqual(state.cancelArgs.contractIds, ["gid://shopify/SubscriptionContract/1"]);
  assert.equal(state.audit.data.metadata.billingStatus, "cancelled_in_shopify");
  assert.equal(state.audit.data.metadata.shopifyCanceledContracts, 1);
  assert.equal(state.audit.data.metadata.shopifyCustomerId, "gid://shopify/Customer/123");
});

test("unlinked Shopify billing returns LINK_SHOPIFY without changing local access", async () => {
  state.shopify.error = new ShopifyCustomerErrorStub("NOT_LINKED", "Not linked", 409);

  const response = await POST(req);

  assert.equal(response.status, 409);
  assert.equal(response.body.code, "LINK_SHOPIFY");
  assert.deepEqual(state.events, ["resolve"]);
  assert.equal(state.audit, null);
});
