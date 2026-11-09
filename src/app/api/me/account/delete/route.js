import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/server/auth";
import { AUTH_COOKIE } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { logError } from "@/lib/server/log";

export const runtime = "nodejs";

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  const limited = rateLimitGuard(`account-delete:${user.uid}`, { limit: 3, windowMs: 60 * 60_000 });
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const emailCode = String(body.emailCode || "").trim();
  const confirmation = String(body.confirmation || "");
  if (confirmation !== "DELETE") {
    return NextResponse.json({ error: 'Type DELETE exactly to confirm.' }, { status: 400 });
  }
  if (!/^\d{6,8}$/.test(emailCode)) {
    return NextResponse.json({ error: "Enter the verification code sent to your email address." }, { status: 400 });
  }
  if (!user.email) {
    return NextResponse.json({ error: "This account has no email address for identity verification. Contact support." }, { status: 400 });
  }

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Account services are temporarily unavailable." }, { status: 503 });

  try {
    // Verify a one-time email code. This works for password and Google/Facebook
    // accounts alike, unlike asking every member to have a local password.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) throw new Error("Supabase public auth configuration is missing.");
    const verifier = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: verified, error: verifyError } = await verifier.auth.verifyOtp({
      email: user.email,
      token: emailCode,
      type: "email",
    });
    if (verifyError || verified?.user?.id !== user.uid) {
      return NextResponse.json({ error: "That verification code is invalid or expired. Your account has not been changed." }, { status: 400 });
    }

    const storedSub = await prisma.subscription.findFirst({
      where: { OR: [{ id: user.uid }, { userId: user.uid }] },
    });
    if (
      storedSub?.provider?.toLowerCase() === "shopify" &&
      ["active", "trialing", "pending"].includes(String(storedSub.status || "").toLowerCase()) &&
      !storedSub.canceledAt
    ) {
      return NextResponse.json({
        error: "Your Shopify membership still appears active. Cancel it in Manage membership first, then try deleting your account again. Deleting your Secret Yarnery login does not cancel external billing.",
      }, { status: 409 });
    }

    // Delete the Auth identity first. The database row is retained as a
    // non-identifying tombstone because many community records have required
    // foreign keys to User; removing the row outright would destroy or orphan
    // other members' conversations and moderation history.
    const { default: supabaseAdmin } = await import("@/lib/supabase/service");
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(user.uid);
    if (authDeleteError && !/not found|does not exist/i.test(authDeleteError.message || "")) {
      logError("account.delete_auth_failed", { uid: user.uid, error: authDeleteError.message });
      return NextResponse.json({ error: "We could not securely close your sign-in account. No profile changes were made." }, { status: 502 });
    }

    await prisma.$transaction(async (tx) => {
      // Keep public contributions and thread structure, but remove their
      // author labels and profile imagery.
      await tx.post.updateMany({
        where: { authorId: user.uid },
        data: { authorId: null, authorName: "Former member", authorRole: null, imageUrl: null, imageUrls: [], videoUrl: null },
      });
      await tx.postComment.updateMany({
        where: { authorId: user.uid },
        data: { authorName: "Former member", reactions: null, createdById: null },
      });
      await tx.announcement.updateMany({ where: { authorId: user.uid }, data: { authorName: "Former member" } });
      await tx.auditLog.updateMany({ where: { actorId: user.uid }, data: { actorName: "Former member", metadata: null } });
      await tx.article.updateMany({
        where: { authorId: user.uid },
        data: { authorName: "Former member", coverImage: null, likes: null },
      });
      await tx.articleComment.updateMany({
        where: { authorId: user.uid },
        data: { authorName: "Former member" },
      });
      await tx.topicThread.updateMany({
        where: { authorId: user.uid },
        data: { authorName: "Former member" },
      });
      await tx.topicReply.updateMany({
        where: { authorId: user.uid },
        data: { authorName: "Former member" },
      });
      await tx.roomMessage.updateMany({
        where: { userId: user.uid },
        data: { userName: "Former member", userAvatar: null, imageData: null, createdById: null },
      });
      await tx.communityQuestion.updateMany({
        where: { authorId: user.uid },
        data: { authorName: "Former member" },
      });
      await tx.communityAnswer.updateMany({
        where: { authorId: user.uid },
        data: { authorName: "Former member" },
      });

      // Remove private account data and member-only activity that is not
      // needed to preserve public discussions or legally required billing.
      await tx.session.deleteMany({ where: { userId: user.uid } });
      await tx.pushSubscription.deleteMany({ where: { userId: user.uid } });
      await tx.socialLink.deleteMany({ where: { userId: user.uid } });
      await tx.whatsAppMessage.deleteMany({ where: { userId: user.uid } });
      await tx.authAttempt.deleteMany({ where: { email: { equals: user.email, mode: "insensitive" } } });
      await tx.musicFile.deleteMany({ where: { uploadedBy: user.uid } });
      await tx.blindDate.deleteMany({ where: { OR: [{ uid: user.uid }, { memberId: user.uid }] } });
      await tx.conversationMessage.deleteMany({ where: { senderId: user.uid } });
      await tx.$executeRaw`UPDATE "Conversation" SET "participantIds" = array_remove("participantIds", ${user.uid}), "lastMessage" = NULL, "lastMessageAt" = NULL WHERE ${user.uid} = ANY("participantIds")`;
      await tx.notification.deleteMany({ where: { OR: [{ userId: user.uid }, { actorId: user.uid }] } });
      await tx.follow.deleteMany({ where: { OR: [{ followerId: user.uid }, { followingId: user.uid }] } });
      await tx.memberWatch.deleteMany({ where: { OR: [{ watcherId: user.uid }, { targetId: user.uid }] } });
      await tx.invitation.deleteMany({ where: { inviterUid: user.uid } });
      await tx.pollVote.deleteMany({ where: { userId: user.uid } });
      await tx.groupMember.deleteMany({ where: { userId: user.uid } });
      await tx.spaceMember.deleteMany({ where: { userId: user.uid } });
      await tx.roomPresence.deleteMany({ where: { userId: user.uid } });
      await tx.roomEvent.deleteMany({ where: { userId: user.uid } });
      await tx.roomSignal.deleteMany({ where: { fromIdentity: user.uid } });
      await tx.availability.deleteMany({ where: { userId: user.uid } });
      await tx.rsvp.deleteMany({ where: { userId: user.uid } });
      await tx.availabilityRsvp.deleteMany({ where: { userId: user.uid } });
      await tx.recognition.deleteMany({ where: { OR: [{ fromUid: user.uid }, { toUid: user.uid }] } });
      await tx.sticker.deleteMany({ where: { OR: [{ fromUid: user.uid }, { toUid: user.uid }] } });
      await tx.accountGrant.deleteMany({ where: { OR: [{ principalId: user.uid }, { granteeId: user.uid }] } });
      await tx.gamification.deleteMany({ where: { userId: user.uid } });
      await tx.gamificationPointEvent.deleteMany({ where: { userId: user.uid } });
      await tx.progress.deleteMany({ where: { userId: user.uid } });
      await tx.quizResult.deleteMany({ where: { userId: user.uid } });
      await tx.certificate.deleteMany({ where: { userId: user.uid } });
      await tx.purchase.deleteMany({ where: { uid: user.uid } });
      await tx.project.deleteMany({ where: { userId: user.uid } });

      // Replace the member row with a non-identifying tombstone. It preserves
      // referential integrity for authored records and financial/audit history.
      await tx.user.update({
        where: { id: user.uid },
        data: {
          name: "Former member",
          username: null,
          email: null,
          photoURL: null,
          coverPhotoURL: null,
          headline: null,
          location: null,
          country: null,
          timezone: null,
          bio: null,
          role: "member",
          roleLabel: null,
          plan: null,
          paymentStatus: "cancelled",
          isPrePaid: false,
          shopifyCustomerId: null,
          shopifyOrderId: null,
          expiresAt: null,
          firstName: null,
          lastName: null,
          phone: null,
          favoriteColors: [],
          crafts: [],
          hobbies: [],
          crochetTechniques: [],
          skillLevel: null,
          craftInterests: [],
          projectTypes: [],
          yarnPreference: null,
          hookSize: null,
          communityGoals: [],
          onboardingCompleted: false,
          onboardingCompletedAt: null,
          yearsExperience: null,
          favoriteYarnBrand: null,
          crochetMotivation: [],
          learningNext: null,
          proudestProject: null,
          bestGiftProject: null,
          goToYarn: null,
          favoriteHookSize: null,
          socialLinks: null,
          extra: null,
          notifications: "off",
          notificationPreferences: null,
          foundingMember: false,
          suspended: true,
          recognitionCount: 0,
          tosAcceptedAt: null,
          tosVersion: null,
        },
      });
    });

    const cookieStore = await cookies();
    cookieStore.delete(AUTH_COOKIE);
    return NextResponse.json({ ok: true });
  } catch (error) {
    // If Auth deletion succeeded but a later database operation failed, make
    // a best-effort attempt to revoke the app sessions and lock the tombstone.
    try {
      await prisma.session.deleteMany({ where: { userId: user.uid } });
      await prisma.user.update({ where: { id: user.uid }, data: { suspended: true } });
      (await cookies()).delete(AUTH_COOKIE);
    } catch (cleanupError) {
      logError("account.delete_emergency_lock_failed", { uid: user.uid, error: cleanupError?.message });
    }
    logError("account.delete_failed", { uid: user.uid, error: error?.message || "Unknown error" });
    return NextResponse.json({
      error: "Your sign-in identity was closed, but we could not finish removing all account data. Please contact Secret Yarnery support so the remaining cleanup can be completed.",
    }, { status: 500 });
  }
}
