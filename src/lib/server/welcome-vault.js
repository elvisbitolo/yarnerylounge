import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

// The "Welcome Vault": a pinned, read-only House Rules announcement that tops
// the community feed. Created once with a fixed id; the Feed renders posts
// with kind "announcement" + authorId "system" in read-only mode.
export const WELCOME_VAULT_ID = "welcome-vault";

export const WELCOME_VAULT_TEXT = `📜 The Welcome Vault — House Rules

Welcome to Christa's Secret Swipe Speakeasy — a private, members-only lounge built for crafters to connect, match, and create together. Every member, whether Flirting, Hooking Up, or Moving In, agrees to our Zero-Tolerance Policy the moment they enter.

1. No Self-Promotion, Advertising, or Selling
This is a sanctuary for connection and crafting — not a marketplace or a billboard. You may not sell patterns, finished objects, yarn, courses, or services; post affiliate links or links to your own commercial shops (on Etsy, Shopify, or elsewhere); or promote external Facebook groups, Discord servers, or subscription platforms. Sharing your personal, non-commercial works-in-progress to celebrate your progress is always welcome.

2. Zero Tolerance for Bullying, Harassment, or Negativity
Bullying, hate speech, body shaming, racism, sexism, personal attacks, passive-aggressive comments, and criticism of another member's skill level are strictly prohibited — in the live video lounges, chat, and community boards alike. Uninvited criticism or policing of other members inside live video streams is likewise prohibited.

3. "Moving In" Host Responsibilities
Hosts must keep their rooms safe, welcoming, and on-topic. Hosts may never use their rooms or sub-groups to promote products, run unapproved businesses, or exclude or harass other paying members. Christa and the Lounge administration reserve the right to shut down any member-created room or group at any time, for any reason.

4. Enforcement: Lifetime Ban & No Refunds
Violation of any core rule results in an immediate, permanent lifetime ban with no refunds. Your account is deleted, and you may not re-join the community under any email address or alias.

The full Terms of Service are always available at /terms. This announcement is read-only.`;

export async function ensureWelcomeVaultPost() {
  const prisma = getPrisma();
  if (!prisma) return { ok: false, error: "No database" };
  try {
    const existing = await prisma.post.findUnique({
      where: { id: WELCOME_VAULT_ID },
      select: { id: true, pinned: true, pinnedAt: true },
    });
    if (existing) {
      if (!existing.pinned) {
        await prisma.post.update({
          where: { id: WELCOME_VAULT_ID },
          data: { pinned: true, pinnedAt: existing.pinnedAt || new Date() },
        });
      }
      return { ok: true, id: WELCOME_VAULT_ID };
    }
    await prisma.post.create({
      data: {
        id: WELCOME_VAULT_ID,
        authorId: "system",
        authorName: "The Speakeasy Team",
        text: WELCOME_VAULT_TEXT,
        kind: "announcement",
        pinned: true,
        pinnedAt: new Date(),
        hashtags: [],
        likes: {},
        bookmarks: {},
        reactions: {},
        commentCount: 0,
        lastActivityAt: new Date(),
        createdAt: new Date(),
      },
    });
    return { ok: true, id: WELCOME_VAULT_ID };
  } catch (err) {
    logError("welcome-vault.seed_failed", { error: err.message });
    return { ok: false, error: err.message };
  }
}