import crypto from "node:crypto";
import { getPrisma } from "@/lib/db/prisma";
import { UPGRADE_URL } from "@/lib/upgrade-url";
import { encryptText, decryptText } from "./crypto.js";
import {
  CANCEL_CONTRACT_MUTATION,
  CUSTOMER_API_SCOPES,
  CUSTOMER_PROFILE_QUERY,
  LINK_STATE_MAX_AGE,
  ShopifyCustomerError,
  buildAuthorizeUrlParams,
  extractGraphqlErrors,
  extractUserErrors,
  formatUserErrors,
  isBenignCancelError,
  isStateFresh,
  normalizeEmail,
  normalizeShopDomain,
  parseStatePayload,
  shopDomainFromUrl,
  toCustomerGid,
} from "./shopify-customer-core.js";

const DISCOVERY_TTL = 30 * 60 * 1000;
const discoveryCache = new Map();
const apiDiscoveryCache = new Map();

export { ShopifyCustomerError } from "./shopify-customer-core.js";

function readConfig(origin) {
  const storeDomain =
    normalizeShopDomain(process.env.SHOPIFY_STORE_DOMAIN) ||
    shopDomainFromUrl(process.env.NEXT_PUBLIC_SHOPIFY_PRICING_URL) ||
    shopDomainFromUrl(UPGRADE_URL);
  const clientId = String(process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET || "").trim();
  const redirectUri =
    String(process.env.SHOPIFY_CUSTOMER_ACCOUNT_REDIRECT_URI || "").trim() ||
    (origin ? `${origin}/api/auth/shopify/callback` : "");
  const scopes = String(process.env.SHOPIFY_CUSTOMER_ACCOUNT_SCOPES || CUSTOMER_API_SCOPES).trim();

  return { storeDomain, clientId, clientSecret, redirectUri, scopes };
}

function requireConfig(origin) {
  const config = readConfig(origin);
  if (!config.storeDomain || !config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new ShopifyCustomerError(
      "CONFIG_MISSING",
      "Shopify Customer Account API is not configured.",
      503,
    );
  }
  return config;
}

export function isShopifyCustomerConfigured(origin = "") {
  const config = readConfig(origin);
  return Boolean(config.storeDomain && config.clientId && config.clientSecret && config.redirectUri);
}

async function fetchJson(url, options, label) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new ShopifyCustomerError("EXTERNAL_FAILED", `Could not reach ${label}.`, 502);
  }
  if (response.status === 401 || response.status === 403) {
    throw new ShopifyCustomerError(
      "RELINK_REQUIRED",
      "Shopify customer authorization expired. Please link billing again.",
      401,
    );
  }
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ShopifyCustomerError("EXTERNAL_FAILED", `${label} returned invalid JSON.`, 502);
    }
  }
  if (!response.ok) {
    throw new ShopifyCustomerError("EXTERNAL_FAILED", `${label} failed (${response.status}).`, 502);
  }
  return payload;
}

async function getDiscovery(config) {
  const cached = discoveryCache.get(config.storeDomain);
  if (cached && Date.now() - cached.at < DISCOVERY_TTL) return cached.value;

  const url = new URL(`https://${config.storeDomain}/.well-known/openid-configuration`);
  url.searchParams.set("scope", config.scopes);
  const payload = await fetchJson(url, { method: "GET" }, "Shopify discovery endpoint");
  const value = {
    authorization_endpoint: String(payload?.authorization_endpoint || ""),
    token_endpoint: String(payload?.token_endpoint || ""),
    end_session_endpoint: String(payload?.end_session_endpoint || ""),
    jwks_uri: String(payload?.jwks_uri || ""),
    issuer: String(payload?.issuer || ""),
  };
  if (!value.authorization_endpoint || !value.token_endpoint) {
    throw new ShopifyCustomerError(
      "CONFIG_MISSING",
      "Shopify discovery did not return OAuth endpoints.",
      503,
    );
  }
  discoveryCache.set(config.storeDomain, { at: Date.now(), value });
  return value;
}

async function getApiDiscovery(config) {
  const cached = apiDiscoveryCache.get(config.storeDomain);
  if (cached && Date.now() - cached.at < DISCOVERY_TTL) return cached.value;

  const url = new URL(`https://${config.storeDomain}/.well-known/customer-account-api`);
  const payload = await fetchJson(url, { method: "GET" }, "Shopify Customer API discovery endpoint");
  const endpoint = String(payload?.graphql_api || "").trim();
  if (!endpoint) {
    throw new ShopifyCustomerError(
      "CONFIG_MISSING",
      "Shopify discovery did not return a GraphQL endpoint.",
      503,
    );
  }
  let value;
  try {
    value = new URL(endpoint).toString();
  } catch {
    throw new ShopifyCustomerError(
      "CONFIG_MISSING",
      "Shopify discovery returned an invalid GraphQL endpoint.",
      503,
    );
  }
  apiDiscoveryCache.set(config.storeDomain, { at: Date.now(), value });
  return value;
}

function createLinkState({ uid, email }) {
  return encryptText(
    JSON.stringify({
      uid,
      email: normalizeEmail(email),
      nonce: crypto.randomBytes(16).toString("hex"),
      issuedAt: Date.now(),
    }),
  );
}

export function readLinkState(raw) {
  let decoded = "";
  try {
    decoded = decryptText(decodeURIComponent(String(raw || "")));
  } catch {
    return null;
  }
  if (!decoded || decoded.startsWith("[message could not be decoded]")) return null;
  const parsed = parseStatePayload(decoded);
  if (!parsed || !isStateFresh(parsed.issuedAt)) return null;
  return parsed;
}

export async function createShopifyAuthorizeUrl({ uid, email, origin }) {
  const config = requireConfig(origin);
  const discovery = await getDiscovery(config);
  const state = createLinkState({ uid, email });
  const url = buildAuthorizeUrlParams({
    authorizationEndpoint: discovery.authorization_endpoint,
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state,
    scopes: config.scopes,
    email,
  });
  return {
    url: url.toString(),
    state,
    cookieValue: encodeURIComponent(state),
    maxAge: LINK_STATE_MAX_AGE,
  };
}

function tokenHeaders(config) {
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  return {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: `Basic ${credentials}`,
  };
}

function normalizeTokenPayload(payload) {
  const accessToken = String(payload?.access_token || "").trim();
  if (!accessToken) {
    throw new ShopifyCustomerError("EXTERNAL_FAILED", "Shopify did not return an access token.", 502);
  }
  const expiresIn = Number(payload?.expires_in);
  return {
    accessToken,
    refreshToken: String(payload?.refresh_token || "").trim(),
    expiresAt:
      Number.isFinite(expiresIn) && expiresIn > 0
        ? new Date(Date.now() + expiresIn * 1000)
        : null,
    scope: String(payload?.scope || "").trim(),
    idToken: String(payload?.id_token || "").trim(),
  };
}

export async function exchangeCustomerCode({ code, origin }) {
  const config = requireConfig(origin);
  const discovery = await getDiscovery(config);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    code: String(code || ""),
  });
  const payload = await fetchJson(
    discovery.token_endpoint,
    {
      method: "POST",
      headers: tokenHeaders(config),
      body: body.toString(),
    },
    "Shopify token endpoint",
  );
  return normalizeTokenPayload(payload);
}

export async function refreshCustomerAccessToken(refreshToken, origin) {
  const config = requireConfig(origin);
  const discovery = await getDiscovery(config);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.clientId,
    refresh_token: String(refreshToken || ""),
  });
  const payload = await fetchJson(
    discovery.token_endpoint,
    {
      method: "POST",
      headers: tokenHeaders(config),
      body: body.toString(),
    },
    "Shopify token endpoint",
  );
  return normalizeTokenPayload(payload);
}

export function decryptStoredValue(value) {
  if (!value) return "";
  const decrypted = decryptText(String(value));
  return decrypted.startsWith("[message could not be decoded]") ? "" : decrypted;
}

function tokenUpdateData(tokens) {
  return {
    shopifyCustomerAccessToken: encryptText(tokens.accessToken),
    shopifyCustomerRefreshToken: tokens.refreshToken ? encryptText(tokens.refreshToken) : null,
    shopifyCustomerTokenExpiresAt: tokens.expiresAt || null,
  };
}

export async function persistShopifyCustomerLink({ uid, tokens, customer, email }) {
  const prisma = getPrisma();
  if (!prisma) {
    throw new ShopifyCustomerError("CONFIG_MISSING", "Database is not configured.", 503);
  }
  const customerGid = toCustomerGid(customer?.id);
  const customerEmail = normalizeEmail(email || customer?.emailAddress?.emailAddress) || null;
  await prisma.user.update({
    where: { id: uid },
    data: {
      ...tokenUpdateData(tokens),
      ...(customerGid ? { shopifyCustomerId: customerGid } : {}),
      shopifyCustomerEmail: customerEmail,
      shopifyCustomerLinkedAt: new Date(),
    },
  });
}

async function refreshAndPersist(uid, refreshToken, origin) {
  const tokens = await refreshCustomerAccessToken(refreshToken, origin);
  const prisma = getPrisma();
  if (prisma) {
    await prisma.user.update({
      where: { id: uid },
      data: tokenUpdateData(tokens),
    });
  }
  return tokens.accessToken;
}

export async function resolveShopifyAccessToken(user, origin) {
  if (!user?.shopifyCustomerAccessToken && !user?.shopifyCustomerRefreshToken) {
    throw new ShopifyCustomerError("NOT_LINKED", "Shopify billing has not been linked.", 409);
  }
  const accessToken = decryptStoredValue(user?.shopifyCustomerAccessToken);
  const refreshToken = decryptStoredValue(user?.shopifyCustomerRefreshToken);
  const expiresAtValue = user?.shopifyCustomerTokenExpiresAt;
  const expiresAt = expiresAtValue ? new Date(expiresAtValue) : null;
  const isFresh = expiresAt ? expiresAt.getTime() > Date.now() + 60_000 : false;

  if (accessToken && (!expiresAt || isFresh)) return accessToken;
  if (refreshToken) return refreshAndPersist(user.id, refreshToken, origin);
  throw new ShopifyCustomerError(
    "RELINK_REQUIRED",
    "Shopify customer authorization expired. Please link billing again.",
    409,
  );
}

async function customerGraphql({ config, accessToken, query, variables }) {
  const endpoint = await getApiDiscovery(config);
  return fetchJson(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: accessToken,
      },
      body: JSON.stringify({ query, variables: variables || {} }),
    },
    "Shopify Customer API",
  );
}

export async function fetchShopifyCustomerProfile(accessToken, origin) {
  const config = requireConfig(origin);
  const payload = await customerGraphql({
    config,
    accessToken,
    query: CUSTOMER_PROFILE_QUERY,
  });
  const graphqlErrors = extractGraphqlErrors(payload);
  if (graphqlErrors.length) {
    throw new ShopifyCustomerError("EXTERNAL_FAILED", graphqlErrors.join("; "), 502);
  }
  const customer = payload?.data?.customer;
  if (!customer) {
    throw new ShopifyCustomerError(
      "CUSTOMER_NOT_FOUND",
      "Shopify customer account was not found.",
      409,
    );
  }
  return {
    customer,
    contractNodes: Array.isArray(customer?.subscriptionContracts?.nodes)
      ? customer.subscriptionContracts.nodes
      : [],
  };
}

export async function cancelShopifyContracts({ accessToken, contractIds, origin }) {
  const ids = Array.isArray(contractIds) ? contractIds.filter(Boolean) : [];
  if (!ids.length) return { canceled: 0, skipped: 0 };
  const config = requireConfig(origin);
  let canceled = 0;
  let skipped = 0;

  for (const contractId of ids) {
    const payload = await customerGraphql({
      config,
      accessToken,
      query: CANCEL_CONTRACT_MUTATION,
      variables: { subscriptionContractId: contractId },
    });
    const graphqlErrors = extractGraphqlErrors(payload);
    if (graphqlErrors.length) {
      throw new ShopifyCustomerError("EXTERNAL_FAILED", graphqlErrors.join("; "), 502);
    }
    const userErrors = extractUserErrors(payload, "subscriptionContractCancel");
    const actionable = userErrors.filter((error) => !isBenignCancelError(error));
    if (actionable.length) {
      throw new ShopifyCustomerError(
        "CANCEL_FAILED",
        `Shopify could not cancel ${contractId}: ${formatUserErrors(actionable)}`,
        409,
      );
    }
    if (userErrors.length) skipped += 1;
    else canceled += 1;
  }

  return { canceled, skipped };
}
