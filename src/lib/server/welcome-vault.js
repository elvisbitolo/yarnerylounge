import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import {
  WELCOME_VAULT_ID,
  WELCOME_VAULT_TEXT,
} from "@/lib/server/welcome-vault-core";

// The "Welcome Vault": a pinned, read-only House Rules announcement that tops
// the community feed. The Feed renders kind "announcement" posts in read-only
// mode via isSystemPost().
export { WELCOME_VAULT_ID, WELCOME_VAULT_TEXT };

// Seeding is disabled. Post.authorId is NOT NULL with a foreign key to User, so
// creating this post requires a real author row. Inventing a service account
// ("system" / "The Speakeasy Team") put a synthetic user into the members table,
// where it showed up in the public directory, in user autocomplete and in the
// member counts, so it is not created here.
//
// The fix is to make Post.authorId nullable and key the read-only rendering off
// a NULL author instead. That is a schema migration and has not been applied, so
// until it is, the announcement is absent rather than faked.
//
// Existing rows are still repaired (pin + text), which is safe and idempotent.
export async function ensureWelcomeVaultPost() {
  const prisma = getPrisma();
  if (!prisma) return { ok: false, error: "No database" };
  try {
    const existing = await prisma.post.findUnique({
      where: { id: WELCOME_VAULT_ID },
      select: { id: true, pinned: true, pinnedAt: true, text: true },
    });
    if (!existing) return { ok: false, error: "Not seeded: Post.authorId is still NOT NULL" };
    if (!existing.pinned) {
      await prisma.post.update({
        where: { id: WELCOME_VAULT_ID },
        data: { pinned: true, pinnedAt: existing.pinnedAt || new Date() },
      });
    }
    if (existing.text !== WELCOME_VAULT_TEXT) {
      await prisma.post.update({
        where: { id: WELCOME_VAULT_ID },
        data: { text: WELCOME_VAULT_TEXT },
      });
    }
    return { ok: true, id: WELCOME_VAULT_ID };
  } catch (err) {
    logError("welcome-vault.seed_failed", { error: err.message });
    return { ok: false, error: err.message };
  }
}
