import { createHash, randomBytes } from "node:crypto";

export const TOKEN_PREFIX = "yry_live_";
export const TOKEN_SECRET_BYTES = 32;
export const TOKEN_PREFIX_DISPLAY = 6;
export const MAX_TOKENS_PER_USER = 25;

export const READ_SCOPES = [
  "read:profile",
  "read:members",
  "read:posts",
  "read:events",
];

export const ALL_SCOPES = [...READ_SCOPES];

export const DEFAULT_SCOPES = [...READ_SCOPES];

export function isValidScope(scope) {
  return typeof scope === "string" && ALL_SCOPES.includes(scope);
}

export function normalizeScopes(scopes) {
  const list = Array.isArray(scopes) ? scopes : [];
  return [...new Set(list.filter(isValidScope))];
}

export function hasScope(scopes, required) {
  if (!required) return true;
  const list = Array.isArray(scopes) ? scopes : [];
  return list.includes(required);
}

export function hashToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

export function generateApiToken() {
  const secret = randomBytes(TOKEN_SECRET_BYTES).toString("base64url");
  const token = `${TOKEN_PREFIX}${secret}`;
  const prefix = `${TOKEN_PREFIX}${secret.slice(0, TOKEN_PREFIX_DISPLAY)}`;
  return { token, prefix, tokenHash: hashToken(token) };
}

export function isApiTokenFormat(token) {
  return typeof token === "string" && token.startsWith(TOKEN_PREFIX) && token.length > TOKEN_PREFIX.length + 10;
}

export function parseBearer(header) {
  if (typeof header !== "string") return "";
  const match = header.match(/^Bearer\s+(\S+)\s*$/i);
  return match ? match[1] : "";
}

export function isExpired(expiresAt, now = Date.now()) {
  if (!expiresAt) return false;
  const ts = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
  return Number.isFinite(ts) && ts <= now;
}

export function isTokenUsable(row, now = Date.now()) {
  if (!row) return false;
  if (row.revokedAt) return false;
  if (isExpired(row.expiresAt, now)) return false;
  return true;
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function serializeToken(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || "",
    prefix: row.prefix || "",
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    lastUsedAt: toIso(row.lastUsedAt),
    expiresAt: toIso(row.expiresAt),
    createdAt: toIso(row.createdAt),
    revokedAt: toIso(row.revokedAt),
  };
}
