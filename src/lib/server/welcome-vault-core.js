// Pure data for the "Welcome Vault" pinned announcement. Kept separate from
// welcome-vault.js so it can be unit tested without a database: the wrapper
// imports "@/lib/..." aliases, which plain `node --test` cannot resolve.
export const WELCOME_VAULT_ID = "welcome-vault";

// Post.authorId is currently NOT NULL with a foreign key to User, so this
// announcement cannot be created until that column is made nullable. It is then
// authored by no one, and the Feed keys its read-only rendering off a null
// author. No service account is ever inserted into User.
export const WELCOME_VAULT_AUTHOR_ID = null;

export const WELCOME_VAULT_TEXT = `📜 Christa's Secret Swipe Speakeasy: Terms of Service

Welcome to the Lounge! By subscribing to or entering Christa's Secret Speakeasy (including the Flirting, Hooking Up, and Moving In tiers), you explicitly agree to follow these Terms of Service. Our goal is to maintain a fun, high-energy, and welcoming environment for all members. To protect this space, we enforce a strict Zero-Tolerance Policy — violation of any core rule results in an immediate, permanent lifetime ban with absolutely no refunds.

1. No Self-Promotion, Advertising, or Selling
This community is a sanctuary for connection and crafting, not a marketplace or a billboard. Banned: selling patterns, finished objects, yarn, courses, or services; affiliate links; links to your own commercial shops (Etsy, Shopify, etc.); promoting external Facebook groups, Discord servers, or subscription platforms. Allowed: sharing your personal, non-commercial works-in-progress to celebrate your progress with the group. Penalty: immediate lifetime ban on the first offense.

2. Zero Tolerance for Bullying, Harassment, or Negativity
We are dedicated to a welcoming and supportive environment. Banned: any form of bullying, hate speech, body shaming, racism, sexism, or personal attacks — including passive-aggressive comments, criticizing another member's skill level, or bringing toxic drama into the live video lounges and chat boards. Live Lounge Safety: uninvited criticism or policing of other members while inside live video streams is strictly prohibited. Penalty: immediate lifetime ban on the first offense.

3. "Moving In" Host Responsibilities & Abuse of Power
Members of the Moving In tier have the privilege to create and host their own live video rooms and sub-groups. With this power comes strict responsibility: hosts must keep their rooms safe, welcoming, and on-topic; they may never use their live rooms or sub-groups to promote products, run unapproved businesses, or exclude/harass other paying members. Christa and the Lounge administration reserve the right to shut down any member-created room or group at any time, for any reason.

4. Direct Enforcement: The Lifetime Ban & No-Refund Policy
To keep the lounge crowded with the best people, we protect our culture fiercely. If the moderation team determines that you have violated these Terms of Service, your account will be deleted immediately. You will be banned for life, and never allowed to re-join under any email address or alias. Absolutely no refunds will be issued — by breaking the community contract, you forfeit any remaining time on your monthly or annual subscription fee.

5. Platform Rights & Changes
Christa's Lounge reserves the right to modify these rules or adjust subscription structures at any time to ensure the safety and longevity of the community. Continued use of the platform after changes are posted constitutes acceptance of the new terms.

The same document is always available at https://christasspeakeasy.com/terms. This announcement is read-only.`;

// authorName is a denormalized byline shown on the post, not a member record.
// authorId stays null so that seeding against a not-yet-migrated database fails
// loudly on the NOT NULL constraint instead of quietly inventing a user.
export function welcomeVaultPostData(now = new Date()) {
  return {
    id: WELCOME_VAULT_ID,
    authorId: WELCOME_VAULT_AUTHOR_ID,
    authorName: "The Speakeasy Team",
    text: WELCOME_VAULT_TEXT,
    kind: "announcement",
    pinned: true,
    pinnedAt: now,
    hashtags: [],
    likes: {},
    bookmarks: {},
    reactions: {},
    commentCount: 0,
    lastActivityAt: now,
    createdAt: now,
  };
}
