import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import {
  WELCOME_VAULT_ID,
  WELCOME_VAULT_TEXT,
  SYSTEM_AUTHOR_ID,
  systemAuthorData,
  welcomeVaultPostData,
} from "@/lib/server/welcome-vault-core";

// The "Welcome Vault": a pinned, read-only House Rules announcement that tops
// the community feed. Created once with a fixed id; the Feed renders posts
// with kind "announcement" + authorId "system" in read-only mode.
export { WELCOME_VAULT_ID, WELCOME_VAULT_TEXT };

// Only required on the create path: once the post exists the function returns
// early, so a healthy database is never written to.
async function ensureSystemAuthor(prisma) {
  await prisma.user.upsert({
    where: { id: SYSTEM_AUTHOR_ID },
    update: {},
    create: systemAuthorData(),
  });
}

export async function ensureWelcomeVaultPost() {
  const prisma = getPrisma();
  if (!prisma) return { ok: false, error: "No database" };
  try {
    const existing = await prisma.post.findUnique({
      where: { id: WELCOME_VAULT_ID },
      select: { id: true, pinned: true, pinnedAt: true, text: true },
    });
    if (existing) {
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
    }
    await ensureSystemAuthor(prisma);
    await prisma.post.create({ data: welcomeVaultPostData() });
    return { ok: true, id: WELCOME_VAULT_ID };
  } catch (err) {
    logError("welcome-vault.seed_failed", { error: err.message });
    return { ok: false, error: err.message };
  }
}
