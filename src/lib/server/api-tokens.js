import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import {
  DEFAULT_SCOPES,
  MAX_TOKENS_PER_USER,
  generateApiToken,
  hashToken,
  isApiTokenFormat,
  isTokenUsable,
  normalizeScopes,
  serializeToken,
} from "@/lib/server/api-tokens-core";

const NAME_MAX = 60;

export function cleanTokenName(name) {
  const clean = typeof name === "string" ? name.trim().slice(0, NAME_MAX) : "";
  return clean || "Unnamed token";
}

// Chooses the scopes to persist. An explicit non-empty request is honoured
// exactly (and an all-invalid request yields a token with *no* scopes rather
// than silently granting everything); omitting scopes grants the read defaults.
export function resolveRequestedScopes(scopes) {
  if (Array.isArray(scopes) && scopes.length > 0) return normalizeScopes(scopes);
  return [...DEFAULT_SCOPES];
}

export async function createApiToken({ userId, name, scopes, expiresAt = null }) {
  const prisma = getPrisma();
  if (!prisma) return { error: "unavailable" };

  try {
    const active = await prisma.apiToken.count({ where: { userId, revokedAt: null } });
    if (active >= MAX_TOKENS_PER_USER) return { error: "limit" };

    const { token, prefix, tokenHash } = generateApiToken();
    const row = await prisma.apiToken.create({
      data: {
        userId,
        name: cleanTokenName(name),
        prefix,
        tokenHash,
        scopes: resolveRequestedScopes(scopes),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
    return { token, record: serializeToken(row) };
  } catch (err) {
    logError("api_tokens.create_failed", { userId, error: err.message });
    return { error: "failed" };
  }
}

export async function listApiTokens(userId) {
  const prisma = getPrisma();
  if (!prisma) return [];
  try {
    const rows = await prisma.apiToken.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(serializeToken);
  } catch (err) {
    logError("api_tokens.list_failed", { userId, error: err.message });
    return [];
  }
}

export async function revokeApiToken(userId, id) {
  const prisma = getPrisma();
  if (!prisma || !id) return false;
  try {
    const result = await prisma.apiToken.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count > 0;
  } catch (err) {
    logError("api_tokens.revoke_failed", { userId, id, error: err.message });
    return false;
  }
}

// Resolves a presented token to its owner and scopes. Returns null for a
// malformed, unknown, revoked or expired token — the caller maps that to 401.
export async function authenticateApiToken(token) {
  if (!isApiTokenFormat(token)) return null;
  const prisma = getPrisma();
  if (!prisma) return null;
  try {
    const row = await prisma.apiToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!row || !isTokenUsable(row)) return null;
    return { tokenId: row.id, userId: row.userId, scopes: Array.isArray(row.scopes) ? row.scopes : [] };
  } catch (err) {
    logError("api_tokens.auth_failed", { error: err.message });
    return null;
  }
}

// Best-effort "last used" stamp; never blocks or fails the request.
export function touchApiToken(id) {
  const prisma = getPrisma();
  if (!prisma || !id) return;
  prisma.apiToken
    .update({ where: { id }, data: { lastUsedAt: new Date() } })
    .catch((err) => logError("api_tokens.touch_failed", { id, error: err.message }));
}
