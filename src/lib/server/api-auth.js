import { authenticateApiToken, touchApiToken } from "@/lib/server/api-tokens";
import { hasScope, parseBearer } from "@/lib/server/api-tokens-core";
import { rateLimit } from "@/lib/server/rate-limit";
import { apiJson } from "@/lib/server/api-http";

export const API_TOKEN_RATE = { limit: 120, windowMs: 60_000 };

// Authenticates a public API request from its Bearer token and enforces the
// required scope plus a per-token rate limit. Returns `{ auth }` on success, or
// `{ response }` that the route should return verbatim.
export async function requireApiToken(req, requiredScope) {
  const token = parseBearer(req.headers.get("authorization"));
  const auth = await authenticateApiToken(token);
  if (!auth) {
    return {
      response: apiJson(
        { error: "Invalid or missing API token" },
        { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
      ),
    };
  }

  if (!hasScope(auth.scopes, requiredScope)) {
    return {
      response: apiJson({ error: `Missing required scope: ${requiredScope}` }, { status: 403 }),
    };
  }

  const limited = rateLimit(`api-v1:${auth.tokenId}`, API_TOKEN_RATE);
  if (!limited.allowed) {
    return {
      response: apiJson(
        { error: "Too many requests, try again shortly" },
        {
          status: 429,
          headers: { "Retry-After": String(Math.max(1, Math.ceil(limited.retryAfterMs / 1000))) },
        }
      ),
    };
  }

  touchApiToken(auth.tokenId);
  return { auth };
}
