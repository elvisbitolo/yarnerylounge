export const LINK_STATE_COOKIE = "shopify-customer-link-state";
export const LINK_STATE_MAX_AGE = 600;
export const CUSTOMER_API_SCOPES = "openid email customer-account-api:full write_own_subscription_contracts";
export const TERMINAL_CONTRACT_STATUSES = new Set(["CANCELLED", "EXPIRED", "STALE"]);
export const CANCELLABLE_CONTRACT_STATUSES = new Set(["ACTIVE", "PAUSED", "FAILED"]);

export class ShopifyCustomerError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = "ShopifyCustomerError";
    this.code = code;
    this.status = status;
  }
}

export function normalizeShopDomain(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/^https?:\/\//i, "").split(/[/?#]/)[0].toLowerCase();
}

export function shopDomainFromUrl(value) {
  try {
    return normalizeShopDomain(new URL(String(value || "")).hostname);
  } catch {
    return "";
  }
}

export function toCustomerGid(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return `gid://shopify/Customer/${raw}`;
  return /^gid:\/\/shopify\/Customer\/\d+$/.test(raw) ? raw : "";
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function selectCancellableContracts(nodes) {
  if (!Array.isArray(nodes)) return [];
  return nodes
    .map((node) => ({
      id: String(node?.id || ""),
      status: String(node?.status || "").toUpperCase(),
    }))
    .filter((node) => node.id && CANCELLABLE_CONTRACT_STATUSES.has(node.status));
}

export function extractGraphqlErrors(payload) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  return errors.map((error) => String(error?.message || "Unknown Shopify GraphQL error"));
}

export function extractUserErrors(payload, key) {
  const errors = payload?.data?.[key]?.userErrors;
  if (!Array.isArray(errors)) return [];
  return errors.map((error) => ({
    field: Array.isArray(error?.field) ? error.field.join(".") : String(error?.field || ""),
    message: String(error?.message || "Unknown Shopify user error"),
    code: String(error?.code || ""),
  }));
}

export function formatUserErrors(userErrors) {
  return userErrors
    .map((error) => [error.code, error.message].filter(Boolean).join(": "))
    .join("; ");
}

export function isBenignCancelError(error) {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "CONTRACT_TERMINATED" ||
    message.includes("already cancelled") ||
    message.includes("already canceled")
  );
}

export function buildAuthorizeUrlParams({ authorizationEndpoint, clientId, redirectUri, state, scopes, email }) {
  if (!authorizationEndpoint || !clientId || !redirectUri || !state) {
    throw new ShopifyCustomerError(
      "CONFIG_MISSING",
      "Shopify Customer Account API is not configured.",
      503,
    );
  }
  const url = new URL(authorizationEndpoint);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes || CUSTOMER_API_SCOPES);
  url.searchParams.set("state", state);
  const hint = normalizeEmail(email);
  if (hint) url.searchParams.set("login_hint", hint);
  return url;
}

export function parseStatePayload(raw) {
  let parsed;
  try {
    parsed = JSON.parse(String(raw || ""));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  if (typeof parsed.uid !== "string" || !parsed.uid) return null;
  const issuedAt = Number(parsed.issuedAt);
  if (!Number.isFinite(issuedAt)) return null;
  return {
    uid: parsed.uid,
    email: typeof parsed.email === "string" ? parsed.email : "",
    nonce: typeof parsed.nonce === "string" ? parsed.nonce : "",
    issuedAt,
  };
}

export function isStateFresh(issuedAt, now = Date.now(), maxAge = LINK_STATE_MAX_AGE) {
  const issued = Number(issuedAt);
  if (!Number.isFinite(issued)) return false;
  const age = now - issued;
  return age >= 0 && age <= maxAge * 1000;
}

export const CUSTOMER_PROFILE_QUERY = `
  query CustomerBillingProfile {
    customer {
      id
      emailAddress {
        emailAddress
      }
      subscriptionContracts(first: 50) {
        nodes {
          id
          status
        }
      }
    }
  }
`;

export const CANCEL_CONTRACT_MUTATION = `
  mutation CancelCustomerSubscriptionContract($subscriptionContractId: ID!) {
    subscriptionContractCancel(subscriptionContractId: $subscriptionContractId) {
      contract {
        id
        status
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;
