import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { registerHooks } from "node:module";

const state = {
  fetches: [],
  updates: [],
  prisma: null,
};

const stubs = {
  "@/lib/db/prisma": {
    getPrisma: () => state.prisma,
  },
  "@/lib/upgrade-url": {
    UPGRADE_URL: "https://secretyarnery.com/pages/speakeasy",
  },
};

function stubSource(name) {
  return Object.entries(stubs[name])
    .map(([key, value]) => `export const ${key} = globalThis.__stubs[${JSON.stringify(name)}][${JSON.stringify(key)}];`)
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

function response(payload, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(payload),
  };
}

beforeEach(() => {
  state.fetches = [];
  state.updates = [];
  state.prisma = {
    user: {
      update: async (args) => {
        state.updates.push(args);
        return args;
      },
    },
  };
  process.env.MESSAGE_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
  process.env.SHOPIFY_STORE_DOMAIN = "example.myshopify.com";
  process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID = "client-id";
  process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET = "client-secret";
  process.env.SHOPIFY_CUSTOMER_ACCOUNT_REDIRECT_URI =
    "https://www.christasspeakeasy.com/api/auth/shopify/callback";
  delete process.env.SHOPIFY_CUSTOMER_ACCOUNT_SCOPES;
});

test("createShopifyAuthorizeUrl and readLinkState round-trip encrypted state", async () => {
  const helper = await import(`../shopify-customer.js?test=${crypto.randomUUID()}`);
  globalThis.fetch = async (url) => {
    state.fetches.push(String(url));
    return response({
      authorization_endpoint: "https://example.myshopify.com/customer/account/authorize",
      token_endpoint: "https://example.myshopify.com/customer/account/token",
    });
  };

  const result = await helper.createShopifyAuthorizeUrl({
    uid: "user-1",
    email: "Member@Example.com",
    origin: "https://www.christasspeakeasy.com",
  });
  const url = new URL(result.url);
  assert.equal(url.searchParams.get("client_id"), "client-id");
  assert.equal(url.searchParams.get("redirect_uri"), process.env.SHOPIFY_CUSTOMER_ACCOUNT_REDIRECT_URI);
  assert.ok(url.searchParams.get("scope").includes("write_own_subscription_contracts"));
  assert.equal(url.searchParams.get("login_hint"), "member@example.com");
  assert.equal(url.searchParams.get("state"), decodeURIComponent(result.cookieValue));
  const parsed = helper.readLinkState(result.cookieValue);
  assert.equal(parsed.uid, "user-1");
  assert.equal(parsed.email, "member@example.com");
  assert.ok(parsed.nonce);
  assert.ok(Number.isFinite(parsed.issuedAt));
});

test("exchangeCustomerCode uses confidential client Basic auth", async () => {
  const helper = await import(`../shopify-customer.js?test=${crypto.randomUUID()}`);
  globalThis.fetch = async (url, options) => {
    state.fetches.push({ url: String(url), options });
    if (String(url).includes("openid-configuration")) {
      return response({
        authorization_endpoint: "https://example.myshopify.com/customer/account/authorize",
        token_endpoint: "https://example.myshopify.com/customer/account/token",
      });
    }
    return response({ access_token: "token", refresh_token: "refresh", expires_in: 3600 });
  };

  const tokens = await helper.exchangeCustomerCode({
    code: "code",
    origin: "https://www.christasspeakeasy.com",
  });
  assert.equal(tokens.accessToken, "token");
  assert.equal(tokens.refreshToken, "refresh");
  const tokenCall = state.fetches.find((entry) => entry.url.includes("/token"));
  assert.equal(
    tokenCall.options.headers.Authorization,
    `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`,
  );
  assert.doesNotMatch(tokenCall.options.body, /client_secret/);
});

test("resolveShopifyAccessToken decrypts a fresh token", async () => {
  const helper = await import(`../shopify-customer.js?test=${crypto.randomUUID()}`);
  const { encryptText } = await import("../crypto.js");
  const token = await helper.resolveShopifyAccessToken(
    {
      id: "user-1",
      shopifyCustomerAccessToken: encryptText("fresh-access-token"),
      shopifyCustomerRefreshToken: null,
      shopifyCustomerTokenExpiresAt: new Date(Date.now() + 3_600_000),
    },
    "https://www.christasspeakeasy.com",
  );
  assert.equal(token, "fresh-access-token");
});

test("fetchShopifyCustomerProfile and cancelShopifyContracts use the Customer API", async () => {
  const helper = await import(`../shopify-customer.js?test=${crypto.randomUUID()}`);
  globalThis.fetch = async (url, options) => {
    state.fetches.push({ url: String(url), options });
    if (String(url).includes("/.well-known/customer-account-api")) {
      return response({
        graphql_api: "https://shopify.com/21839020096/account/customer/api/2026-10/graphql",
      });
    }
    const body = JSON.parse(options.body);
    if (body.query.includes("CustomerBillingProfile")) {
      return response({
        data: {
          customer: {
            id: "gid://shopify/Customer/123",
            emailAddress: { emailAddress: "member@example.com" },
            subscriptionContracts: {
              nodes: [
                { id: "gid://shopify/SubscriptionContract/1", status: "ACTIVE" },
                { id: "gid://shopify/SubscriptionContract/2", status: "CANCELLED" },
              ],
            },
          },
        },
      });
    }
    if (body.query.includes("CancelCustomerSubscriptionContract")) {
      return response({ data: { subscriptionContractCancel: { userErrors: [] } } });
    }
    return response({ errors: [{ message: "unexpected query" }] });
  };

  const profile = await helper.fetchShopifyCustomerProfile(
    "access-token",
    "https://www.christasspeakeasy.com",
  );
  assert.equal(profile.customer.id, "gid://shopify/Customer/123");
  assert.equal(profile.contractNodes.length, 2);
  const graphqlCall = state.fetches.find((entry) =>
    entry.url.includes("/account/customer/api/2026-10/graphql"),
  );
  assert.equal(
    graphqlCall.url,
    "https://shopify.com/21839020096/account/customer/api/2026-10/graphql",
  );
  assert.equal(graphqlCall.options.headers.Authorization, "access-token");
  assert.ok(!state.fetches.some((entry) => entry.url.includes("example.myshopify.com/customer/api/")));

  const result = await helper.cancelShopifyContracts({
    accessToken: "access-token",
    contractIds: ["gid://shopify/SubscriptionContract/1"],
    origin: "https://www.christasspeakeasy.com",
  });
  assert.deepEqual(result, { canceled: 1, skipped: 0 });
});
