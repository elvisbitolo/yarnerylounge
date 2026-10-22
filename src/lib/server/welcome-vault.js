import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import {
  WELCOME_VAULT_ID,
  WELCOME_VAULT_TEXT,
  ensureWelcomeVaultPostWith,
} from "@/lib/server/welcome-vault-core";

// The "Welcome Vault": a pinned, read-only House Rules announcement that tops
// the community feed. The Feed renders kind "announcement" posts in read-only
// mode via isSystemPost().
//
// The announcement has no member author. Post.authorId is nullable, so the post
// is created with authorId null instead of inventing a service account. A
// synthetic "system" user was tried before and it put a fake member into the
// public directory, the @mention list and the member counts.
export { WELCOME_VAULT_ID, WELCOME_VAULT_TEXT };

// `db` is injectable for tests; production callers pass nothing.
export async function ensureWelcomeVaultPost(db) {
  const prisma = db || getPrisma();
  if (!prisma) return { ok: false, error: "No database" };
  const result = await ensureWelcomeVaultPostWith(prisma);
  if (!result.ok) {
    logError("welcome-vault.seed_failed", { error: result.error });
  }
  return result;
}
