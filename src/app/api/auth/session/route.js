import { NextResponse } from "next/server";
import { AUTH_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/server/auth";
import { CANONICAL_ORIGIN } from "@/lib/server/origin";
import { serializeSessionCookie } from "@/lib/server/auth-core";
import { assertSameOrigin } from "@/lib/server/same-origin";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { logError } from "@/lib/server/log";
import { verifySupabaseToken } from "@/lib/server/auth";
import { createSession } from "@/lib/server/session-store";
import { getPrisma } from "@/lib/db/prisma";

export async function POST(req) {
  const crossOrigin = assertSameOrigin(req);
  if (crossOrigin) return crossOrigin;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = rateLimitGuard(`session-ip:${ip}`, { limit: 30 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { supabaseToken, supabaseRefreshToken, name } = body;
    if (!supabaseToken) {
      return NextResponse.json({ error: "Missing credential" }, { status: 400 });
    }

    const identity = await verifySupabaseToken(supabaseToken);
    if (!identity) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const perAccount = rateLimitGuard(`session-uid:${identity.uid}`, { limit: 20 });
    if (perAccount) return perAccount;

    if (identity.email && !identity.email_verified) {
      return NextResponse.json(
        { error: "email_not_verified" },
        { status: 403 }
      );
    }

    const prisma = getPrisma();
    let member = await prisma.user.findUnique({
      where: { id: identity.uid },
    });
    let isNewUser = false;

    if (!member) {
      const prepaidEmail = (identity.email || "").toLowerCase().trim();
      const { isOpenAccess, OPEN_ACCESS_PLAN } = await import("@/lib/server/access-policy");
      const openAccess = isOpenAccess();
      const memberName =
        name || identity.name || (prepaidEmail ? prepaidEmail.split("@")[0] : "") || "Member";

      // Create the authenticated account and claim any Shopify pre-paid
      // placeholder in one transaction. The placeholder is keyed by email;
      // the real account is keyed by Supabase UID. Moving the membership data
      // before deleting the placeholder prevents paid buyers losing access.
      let provisioned;
      try {
        provisioned = await prisma.$transaction(async (tx) => {
        const racedMember = await tx.user.findUnique({
          where: { id: identity.uid },
        });
        if (racedMember) return { member: racedMember, created: false };

        const prepaid = prepaidEmail
          ? await tx.user.findFirst({
              where: { email: prepaidEmail, isPrePaid: true },
              include: { subscription: true },
            })
          : null;

        // Anyone may create a free Flirting account. A paid Shopify
        // placeholder, when present, is claimed below and keeps its paid
        // membership; otherwise the new account starts on Flirting.

        const createdMember = await tx.user.create({
          data: {
            id: identity.uid,
            name: memberName || prepaid?.name || "Member",
            email: identity.email || prepaid?.email || null,
            photoURL: identity.photoURL || prepaid?.photoURL || null,
            role: prepaid?.role || "member",
            plan: prepaid?.plan || (openAccess ? OPEN_ACCESS_PLAN : "flirting"),
            paymentStatus: prepaid?.paymentStatus || (openAccess ? "paid" : "unpaid"),
            isPrePaid: false,
            shopifyCustomerId: prepaid?.shopifyCustomerId || null,
            shopifyOrderId: prepaid?.shopifyOrderId || null,
            expiresAt: prepaid?.expiresAt || null,
            createdAt: new Date(),
          },
        });

        // Older or manually-created prepaid records may already have a
        // subscription row. Re-key it to the authenticated UID before
        // removing the email placeholder.
        if (prepaid?.subscription) {
          const oldSub = prepaid.subscription;
          await tx.subscription.upsert({
            where: { id: identity.uid },
            create: {
              id: identity.uid,
              userId: identity.uid,
              provider: oldSub.provider,
              status: oldSub.status,
              plan: oldSub.plan,
              planName: oldSub.planName,
              tier: oldSub.tier,
              role: oldSub.role,
              shopifyCustomerId: oldSub.shopifyCustomerId,
              shopifyOrderId: oldSub.shopifyOrderId,
              providerCustomerId: oldSub.providerCustomerId,
              providerSubscriptionId: oldSub.providerSubscriptionId,
              priceId: oldSub.priceId,
              currentPeriodStart: oldSub.currentPeriodStart,
              currentPeriodEnd: oldSub.currentPeriodEnd,
              trialStart: oldSub.trialStart,
              trialEnd: oldSub.trialEnd,
              cancelAtPeriodEnd: oldSub.cancelAtPeriodEnd,
              canceledAt: oldSub.canceledAt,
            },
            update: {
              userId: identity.uid,
              provider: oldSub.provider,
              status: oldSub.status,
              plan: oldSub.plan,
              planName: oldSub.planName,
              tier: oldSub.tier,
              role: oldSub.role,
              shopifyCustomerId: oldSub.shopifyCustomerId,
              shopifyOrderId: oldSub.shopifyOrderId,
              providerCustomerId: oldSub.providerCustomerId,
              providerSubscriptionId: oldSub.providerSubscriptionId,
              priceId: oldSub.priceId,
              currentPeriodStart: oldSub.currentPeriodStart,
              currentPeriodEnd: oldSub.currentPeriodEnd,
              trialStart: oldSub.trialStart,
              trialEnd: oldSub.trialEnd,
              cancelAtPeriodEnd: oldSub.cancelAtPeriodEnd,
              canceledAt: oldSub.canceledAt,
            },
          });
          await tx.subscription.delete({ where: { id: prepaid.id } });
        }

        if (prepaid) {
          await tx.user.delete({ where: { id: prepaid.id } });
        }

        if (openAccess && !prepaid?.subscription) {
          await tx.subscription.upsert({
            where: { id: identity.uid },
            create: {
              id: identity.uid,
              userId: identity.uid,
              provider: "open-access",
              status: "active",
              plan: OPEN_ACCESS_PLAN,
              planName: OPEN_ACCESS_PLAN,
              tier: OPEN_ACCESS_PLAN,
              role: "member",
              updatedAt: new Date(),
            },
            update: {
              provider: "open-access",
              status: "active",
              plan: OPEN_ACCESS_PLAN,
              planName: OPEN_ACCESS_PLAN,
              tier: OPEN_ACCESS_PLAN,
              role: "member",
              updatedAt: new Date(),
            },
          });
        }

        return { member: createdMember, created: true };
        });
      } catch (err) {
        // Two auth callbacks can race on the first signup. If the other
        // request won the unique UID insert, reuse its committed account
        // instead of returning a signup error to the member.
        if (err.code !== "P2002") throw err;
        const racedMember = await prisma.user.findUnique({
          where: { id: identity.uid },
        });
        if (!racedMember) throw err;
        provisioned = { member: racedMember, created: false };
      }

      member = provisioned.member;
      isNewUser = provisioned.created;

      // A simultaneous OAuth/email callback may have created the account
      // first. Only the request that actually creates it sends onboarding
      // messages and runs the new-member automation.
      if (isNewUser && identity.email) {
        const { sendEmail } = await import("@/lib/server/email");
        await sendEmail({
          to: identity.email,
          subject: "Welcome to Secret Yarnery",
          text:
            `Hi ${member.name || memberName},\n\n` +
            `Welcome to Secret Yarnery! You're now a member of the community.\n\n` +
            `Here's what's inside:\n` +
            `- Live video lounges for real-time conversation\n` +
            `- Courses with lessons and progress tracking\n` +
            `- Events with RSVPs and reminders\n` +
            `- Groups, spaces, direct messages and a community feed\n\n` +
            `To start exploring: ${process.env.NEXT_PUBLIC_APP_URL || CANONICAL_ORIGIN}/explore\n\n` +
            `We're glad you're here.\n\n— The Secret Yarnery Team`,
        }).catch((err) => {
          logError("email.welcome_failed", { uid: identity.uid, error: err.message });
        });
      }

      if (isNewUser) {
        const { runAutomations } = await import("@/lib/server/automations");
        runAutomations("new_member", {
          memberName: member.name || memberName,
          memberEmail: identity.email || "",
          memberUid: identity.uid,
          subjectUid: identity.uid,
          subjectName: member.name || memberName,
        }).catch((err) => {
          logError("automation.new_member_failed", { uid: identity.uid, error: err.message });
        });
      }
    } else if (identity.photoURL && !member.photoURL) {
      member = await prisma.user.update({
        where: { id: identity.uid },
        data: { photoURL: identity.photoURL },
      });
    }

    const sid = await createSession({
      uid: identity.uid,
      accessToken: supabaseToken,
      refreshToken: supabaseRefreshToken || null,
    });
    if (!sid) {
      throw new Error("session row not created");
    }

    // Every genuinely new account must accept the current Terms before
    // entering the app. Existing accounts use their persisted consent state.
    const { mapUserRow } = await import("@/lib/server/user-core");
    const { needsTosConsent } = await import("@/lib/tos");
    const needsConsent = needsTosConsent(mapUserRow(member));

    const res = NextResponse.json({
      ok: true,
      uid: identity.uid,
      isNewUser,
      needsConsent,
    });
    res.cookies.set(
      AUTH_COOKIE,
      serializeSessionCookie(sid),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_MAX_AGE_SECONDS,
      }
    );
    return res;
  } catch (err) {
    logError("auth.session_exchange_failed", { error: err.message });
    return NextResponse.json(
      { error: "server_error", message: "Could not create your session. Please try again." },
      { status: 500 }
    );
  }
}
