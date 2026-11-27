import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CANCELLABLE_CONTRACT_STATUSES,
  CUSTOMER_API_SCOPES,
  TERMINAL_CONTRACT_STATUSES,
  buildAuthorizeUrlParams,
  extractGraphqlErrors,
  extractUserErrors,
  formatUserErrors,
  isBenignCancelError,
  isStateFresh,
  normalizeEmail,
  normalizeShopDomain,
  parseStatePayload,
  selectCancellableContracts,
  shopDomainFromUrl,
  toCustomerGid,
} from "../shopify-customer-core.js";

test("normalizeShopDomain strips protocol, paths and query strings", () => {
  assert.equal(normalizeShopDomain("  https://Example.myshopify.com/admin?x=1 "), "example.myshopify.com");
  assert.equal(shopDomainFromUrl("https://secretyarnery.com/pages/speakeasy"), "secretyarnery.com");
  assert.equal(normalizeShopDomain(""), "");
});

test("toCustomerGid accepts numeric ids and customer gids only", () => {
  assert.equal(toCustomerGid("123"), "gid://shopify/Customer/123");
  assert.equal(toCustomerGid("gid://shopify/Customer/123"), "gid://shopify/Customer/123");
  assert.equal(toCustomerGid("gid://shopify/Order/123"), "");
  assert.equal(toCustomerGid("abc"), "");
});

test("selectCancellableContracts filters terminal and invalid contracts", () => {
  const contracts = [
    { id: "gid://shopify/SubscriptionContract/1", status: "ACTIVE" },
    { id: "gid://shopify/SubscriptionContract/2", status: "PAUSED" },
    { id: "gid://shopify/SubscriptionContract/3", status: "FAILED" },
    { id: "gid://shopify/SubscriptionContract/4", status: "CANCELLED" },
    { id: "gid://shopify/SubscriptionContract/5", status: "EXPIRED" },
    { id: "", status: "ACTIVE" },
  ];
  const selected = selectCancellableContracts(contracts);
  assert.deepEqual(selected.map((contract) => contract.id), [
    "gid://shopify/SubscriptionContract/1",
    "gid://shopify/SubscriptionContract/2",
    "gid://shopify/SubscriptionContract/3",
  ]);
  assert.equal(CANCELLABLE_CONTRACT_STATUSES.has("ACTIVE"), true);
  assert.equal(TERMINAL_CONTRACT_STATUSES.has("CANCELLED"), true);
});

test("extractGraphqlErrors and extractUserErrors normalize Shopify errors", () => {
  assert.deepEqual(
    extractGraphqlErrors({ errors: [{ message: "bad token" }, {}] }),
    ["bad token", "Unknown Shopify GraphQL error"],
  );
  const userErrors = extractUserErrors(
    {
      data: {
        subscriptionContractCancel: {
          userErrors: [
            { field: ["subscriptionContractId"], message: "not found", code: "NOT_FOUND" },
            { message: "already canceled", code: "CONTRACT_TERMINATED" },
          ],
        },
      },
    },
    "subscriptionContractCancel",
  );
  assert.equal(userErrors[0].field, "subscriptionContractId");
  assert.equal(userErrors[0].code, "NOT_FOUND");
  assert.equal(formatUserErrors(userErrors), "NOT_FOUND: not found; CONTRACT_TERMINATED: already canceled");
});

test("isBenignCancelError tolerates already canceled contracts", () => {
  assert.equal(isBenignCancelError({ code: "CONTRACT_TERMINATED" }), true);
  assert.equal(isBenignCancelError({ message: "Contract is already cancelled" }), true);
  assert.equal(isBenignCancelError({ code: "NOT_FOUND", message: "missing" }), false);
});

test("buildAuthorizeUrlParams sets OAuth parameters and login hint", () => {
  const url = buildAuthorizeUrlParams({
    authorizationEndpoint: "https://example.myshopify.com/customer/account/authorize",
    clientId: "client-1",
    redirectUri: "https://www.christasspeakeasy.com/api/auth/shopify/callback",
    state: "opaque-state",
    scopes: CUSTOMER_API_SCOPES,
    email: " Member@Example.COM ",
  });
  assert.equal(url.searchParams.get("client_id"), "client-1");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), "opaque-state");
  assert.equal(url.searchParams.get("scope"), CUSTOMER_API_SCOPES);
  assert.equal(url.searchParams.get("login_hint"), "member@example.com");
});

test("parseStatePayload and isStateFresh reject invalid or stale state", () => {
  const now = Date.now();
  const raw = JSON.stringify({ uid: "user-1", email: "member@example.com", issuedAt: now, nonce: "n" });
  assert.deepEqual(parseStatePayload(raw), {
    uid: "user-1",
    email: "member@example.com",
    issuedAt: now,
    nonce: "n",
  });
  assert.equal(parseStatePayload("not json"), null);
  assert.equal(parseStatePayload(JSON.stringify({ issuedAt: now })), null);
  assert.equal(isStateFresh(now, now + 1000), true);
  assert.equal(isStateFresh(now, now + 601_000), false);
});

test("normalizeEmail trims and lowercases email addresses", () => {
  assert.equal(normalizeEmail("  Member@Example.com "), "member@example.com");
});
