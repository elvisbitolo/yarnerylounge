import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/server/auth";
import { AUTH_COOKIE } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { logError } from "@/lib/server/log";
import { sendEmail } from "@/lib/server/email";

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
  if (user.actorUid && user.actorUid !== user.uid) {
    return NextResponse.json({ error: "Sign in directly to your own account before requesting account deletion." }, { status: 403 });
  }

  const limited = rateLimitGuard(`account-delete:${user.uid}`, { limit: 3, windowMs: 60 * 60_000 });
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  if (body.action === "send-code") {
    if (!user.email) return NextResponse.json({ error: "This account has no email address for verification." }, { status: 400 });
    try {
      const { default: supabaseAdmin } = await import("@/lib/supabase/service");
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email: user.email });
      if (error || !data?.properties?.email_otp) throw new Error(error?.message || "Could not generate an email verification code.");
      const code = data.properties.email_otp;
      const sent = await sendEmail({
        to: user.email,
        subject: "Your Secret Yarnery account deletion code",
        text: `Use this one-time code to confirm account deletion: ${code}. It can only be used once. If you did not request this, ignore this email.`,
        html: `<p>Use this one-time code to confirm account deletion:</p><p style="font-size:28px;font-weight:700;letter-spacing:8px;color:#f6077a;">${code}</p><p>This code can only be used once. If you did not request this, ignore this email.</p>`,
      });
      if (sent?.skipped) return NextResponse.json({ error: "Email delivery is not configured. Please contact Secret Yarnery support." }, { status: 503 });
      return NextResponse.json({ ok: true });
    } catch (error) {
      logError("account.delete_code_send_failed", { uid: user.uid, error: error?.message });
      return NextResponse.json({ error: "Could not send the verification code. Please try again." }, { status: 502 });
    }
  }
  const emailCode = String(body.emailCode || "").trim();
  const accessToken = String(body.accessToken || "");
  const confirmation = String(body.confirmation || "");
  if (confirmation !== "DELETE") {
    return NextResponse.json({ error: 'Type DELETE exactly to confirm.' }, { status: 400 });
  }
  if (!/^\d{6,8}$/.test(emailCode) && accessToken.length < 100) {
    return NextResponse.json({ error: "Enter the verification code sent to your email address." }, { status: 400 });
  }
  if (!user.email) {
    return NextResponse.json({ error: "This account has no email address for identity verification. Contact support." }, { status: 400 });
  }

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Account services are temporarily unavailable." }, { status: 503 });

  let blobUrls = [];
  let authDeleted = false;
  try {
    // Verify a one-time email code. This works for password and Google/Facebook
    // accounts alike, unlike asking every member to have a local password.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) throw new Error("Supabase public auth configuration is missing.");
    let verifiedUser = null;
    if (accessToken.length >= 100) {
      const { default: supabaseAdmin } = await import("@/lib/supabase/service");
      const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
      if (!error) verifiedUser = data?.user || null;
    } else {
      const verifier = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await verifier.auth.verifyOtp({ email: user.email, token: emailCode, type: "magiclink" });
      if (!error) verifiedUser = data?.user || null;
    }
    if (verifiedUser?.id !== user.uid || String(verifiedUser.email || "").toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json({ error: "That email verification is invalid or expired. Your account has not been changed." }, { status: 400 });
    }

    const accountRole = await prisma.user.findUnique({ where: { id: user.uid }, select: { role: true } });
    if (accountRole?.role === "owner") {
      const otherOwners = await prisma.user.count({ where: { id: { not: user.uid }, role: "owner", OR: [{ suspended: false }, { suspended: null }] } });
      if (otherOwners === 0) {
        return NextResponse.json({ error: "Transfer ownership to another active owner before deleting this account. Secret Yarnery must retain an active owner." }, { status: 409 });
      }
    }

    const [profileMedia, memberPosts, memberArticles, memberProjects] = await Promise.all([
      prisma.user.findUnique({ where: { id: user.uid }, select: { photoURL: true, coverPhotoURL: true } }),
      prisma.post.findMany({ where: { authorId: user.uid }, select: { imageUrl: true, imageUrls: true, videoUrl: true } }),
      prisma.article.findMany({ where: { authorId: user.uid }, select: { coverImage: true } }),
      prisma.project.findMany({ where: { userId: user.uid }, select: { imageUrls: true } }),
    ]);
    const candidates = [profileMedia?.photoURL, profileMedia?.coverPhotoURL,
      ...memberPosts.flatMap((post) => [post.imageUrl, post.videoUrl, ...(post.imageUrls || [])]),
      ...memberArticles.map((article) => article.coverImage),
      ...memberProjects.flatMap((project) => project.imageUrls || []),
    ];
    blobUrls = [...new Set(candidates.filter((value) => {
      try { return new URL(value).hostname.endsWith("blob.vercel-storage.com"); } catch { return false; }
    }))];

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

    authDeleted = true;

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
      await tx.postVersion.updateMany({ where: { editorId: user.uid }, data: { editorId: null, editorName: "Former member" } });
      await tx.postModerationLog.updateMany({ where: { actorId: user.uid }, data: { actorId: null, actorName: "Former member" } });
      await tx.report.updateMany({ where: { reporterId: user.uid }, data: { reporterName: "Former member" } });
      await tx.announcement.updateMany({ where: { authorId: user.uid }, data: { authorName: "Former member" } });
      await tx.auditLog.updateMany({ where: { actorId: user.uid }, data: { actorName: "Former member", metadata: null } });
      await tx.automation.deleteMany({ where: { createdBy: user.uid } });
      await tx.automationHistory.updateMany({ where: { targetUserId: user.uid }, data: { targetUserId: null } });
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
      await tx.invitation.updateMany({ where: { acceptedUid: user.uid }, data: { acceptedUid: null, recipientEmail: null, recipientName: "Former member" } });
      await tx.matchDecision.deleteMany({ where: { OR: [{ userId: user.uid }, { targetUserId: user.uid }] } });
      await tx.hostAssignment.deleteMany({ where: { OR: [{ userId: user.uid }, { grantedBy: user.uid }] } });
      await tx.postSubscription.deleteMany({ where: { userId: user.uid } });
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

    // Remove uploaded media from this app's Vercel Blob store after database
    // references have been cleared. External avatar URLs are never deleted.
    if (blobUrls.length) {
      try {
        const { del } = await import("@vercel/blob");
        await del(blobUrls);
      } catch (blobError) {
        logError("account.delete_blob_cleanup_failed", { uid: user.uid, count: blobUrls.length, error: blobError?.message });
      }
    }

    const cookieStore = await cookies();
    cookieStore.delete(AUTH_COOKIE);
    return NextResponse.json({ ok: true });
  } catch (error) {
    // If Auth deletion succeeded but a later database operation failed, make
    // a best-effort attempt to revoke the app sessions and lock the tombstone.
    if (authDeleted) {
      try {
        await prisma.session.deleteMany({ where: { userId: user.uid } });
        await prisma.user.update({ where: { id: user.uid }, data: { suspended: true } });
        (await cookies()).delete(AUTH_COOKIE);
      } catch (cleanupError) {
        logError("account.delete_emergency_lock_failed", { uid: user.uid, error: cleanupError?.message });
      }
    }
    logError("account.delete_failed", { uid: user.uid, error: error?.message || "Unknown error" });
    return NextResponse.json({
      error: "Your sign-in identity was closed, but we could not finish removing all account data. Please contact Secret Yarnery support so the remaining cleanup can be completed.",
    }, { status: 500 });
  }
}
