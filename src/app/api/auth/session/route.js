import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import {
  AUTH_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  getCurrentUserStatus,
  getUserDoc,
} from "@/lib/server/auth";
import { parseSessionCookie, serializeSessionCookie } from "@/lib/server/auth-core";
import { assertSameOrigin } from "@/lib/server/same-origin";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { logError } from "@/lib/server/log";
import { verifySupabaseToken } from "@/lib/server/auth";
import { createSession, SESSION_OK } from "@/lib/server/session-store";
import {
  canUseSwitcher,
  canUseSwitcherSession,
  claimAccountForRoot,
  getSwitchRoot,
  tagSessionForSwitch,
} from "@/lib/server/account-switch";
import { getPrisma } from "@/lib/db/prisma";
import { selectEmailMember } from "@/lib/server/member-resolution";

export async function POST(req) {
  const crossOrigin = assertSameOrigin(req);
  if (crossOrigin) return crossOrigin;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = rateLimitGuard(`session-ip:${ip}`, { limit: 30 });
  if (limited) return limited;

  let failureStage = "request_validation";
  const referenceId = randomUUID();

  try {
    const body = await req.json();
    const { supabaseToken, supabaseRefreshToken, name } = body;
    const addAccount = body?.addAccount === true;
    if (!supabaseToken) {
      return NextResponse.json({ error: "Missing credential" }, { status: 400 });
    }

    const identity = await verifySupabaseToken(supabaseToken);
    if (!identity) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Adding an account keeps the current session alive. Resolve the owner
    // group first so a member who is not allowed to switch cannot create a
    // second session even if they call this endpoint directly.
    let switchRoot = null;
    let currentSid = null;
    if (addAccount) {
      const current = await getCurrentUserStatus();
      if (current.status !== SESSION_OK) {
        return NextResponse.json(
          { error: "Sign in to your owner account before adding another account." },
          { status: 401 }
        );
      }
      const realUid = current.identity.actorUid || current.identity.uid;
      const currentDoc = await getUserDoc(realUid);
      switchRoot = await getSwitchRoot(currentDoc);
      currentSid = parseSessionCookie((await cookies()).get(AUTH_COOKIE)?.value)?.sid;
      if (
        !switchRoot ||
        !canUseSwitcher(switchRoot.rootDoc) ||
        !(await canUseSwitcherSession({
          sid: currentSid,
          rootId: switchRoot.rootId,
          realUid,
        }))
      ) {
        return NextResponse.json({ error: "Account switching is not enabled" }, { status: 403 });
      }
      if (identity.uid === realUid) {
        return NextResponse.json({ error: "You are already signed in to that account." }, { status: 409 });
      }
    }

    const perAccount = rateLimitGuard(`session-uid:${identity.uid}`, { limit: 20 });
    if (perAccount) return perAccount;

    failureStage = "member_database_lookup";
    const prisma = getPrisma();
    if (!prisma) {
      const error = new Error("Database connection is not configured for this deployment.");
      error.code = "DATABASE_NOT_CONFIGURED";
      throw error;
    }
    // Always resolve the verified email across every matching member row,
    // even when the Supabase UID already matches one row. OAuth signup can
    // create a lower-tier duplicate whose ID equals the auth UID while the
    // original paid membership remains under a legacy ID.
    const uidMember = await prisma.user.findUnique({
      where: { id: identity.uid },
      include: { subscription: true },
    });
    let member = uidMember;

    if (identity.email_verified && identity.email) {
      const emailMatches = await prisma.user.findMany({
        where: { email: { equals: identity.email.trim(), mode: "insensitive" } },
        include: { subscription: true },
      });
      const candidates = new Map(emailMatches.map((candidate) => [candidate.id, candidate]));
      if (uidMember) candidates.set(uidMember.id, uidMember);

      const resolution = selectEmailMember([...candidates.values()]);
      if (resolution.ambiguous) {
        return NextResponse.json(
          { error: "email_account_ambiguous", message: "Multiple member accounts match this verified email. Please contact support." },
          { status: 409 }
        );
      }
      member = resolution.member || uidMember;
    }

    let isNewUser = false;

    if (!member) {
      failureStage = "member_provisioning";
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
            extra: { ...(prepaid?.extra && typeof prepaid.extra === "object" ? prepaid.extra : {}), welcomeJourneyPending: true },
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
        } else if (prepaid) {
          // Backfill a subscription row for older prepaid placeholders that
          // predate the transactional Shopify subscription write. Without
          // this row, the normal access resolver would fall back to Flirting
          // even though the paid User record had been transferred.
          const tier = prepaid.plan || "flirting";
          await tx.subscription.upsert({
            where: { id: identity.uid },
            create: {
              id: identity.uid,
              userId: identity.uid,
              provider: "shopify",
              status: "active",
              plan: "monthly",
              planName: tier,
              tier,
              role: prepaid.role || "member",
              shopifyCustomerId: prepaid.shopifyCustomerId || "",
              shopifyOrderId: prepaid.shopifyOrderId || "",
              ...(prepaid.expiresAt ? { currentPeriodEnd: prepaid.expiresAt } : {}),
              updatedAt: new Date(),
            },
            update: {
              userId: identity.uid,
              provider: "shopify",
              status: "active",
              planName: tier,
              tier,
              role: prepaid.role || "member",
              shopifyCustomerId: prepaid.shopifyCustomerId || "",
              shopifyOrderId: prepaid.shopifyOrderId || "",
              ...(prepaid.expiresAt ? { currentPeriodEnd: prepaid.expiresAt } : {}),
              updatedAt: new Date(),
            },
          });
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
      // first. Only the request that actually creates it runs the new-member
      // automation.
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
        where: { id: member.id },
        data: { photoURL: identity.photoURL },
      });
    }

    if (addAccount) {
      const claim = await claimAccountForRoot(member, switchRoot.rootId);
      if (!claim.ok) {
        return NextResponse.json({ error: claim.error }, { status: 409 });
      }
      await tagSessionForSwitch(currentSid, switchRoot.rootId);
    }

    failureStage = "session_persistence";
    const sid = await createSession({
      uid: member.id,
      accessToken: supabaseToken,
      refreshToken: supabaseRefreshToken || null,
      switchOwnerId: addAccount ? switchRoot.rootId : null,
    });
    if (!sid) {
      throw new Error("session row not created");
    }

    // Every genuinely new account must accept the current Terms before
    // entering the app. Existing accounts use their persisted consent state.
    failureStage = "consent_check";
    const { mapUserRow } = await import("@/lib/server/user-core");
    const { needsTosConsent } = await import("@/lib/tos");
    const needsConsent = needsTosConsent(mapUserRow(member));

    const res = NextResponse.json({
      ok: true,
      uid: member.id,
      isNewUser,
      needsConsent,
      switched: addAccount,
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
    const errorCode = String(err?.code || "AUTH_SESSION_EXCHANGE_FAILED").slice(0, 80);
    const databaseUnavailable = ["P1001", "P1002", "P2024", "P1017"].includes(errorCode);
    let message;

    if (errorCode === "DATABASE_NOT_CONFIGURED") {
      message = "The sign-in service is not connected to its member database. Please contact support and share the reference ID below.";
    } else if (databaseUnavailable) {
      message = "The member database is temporarily unreachable or busy. Wait a minute, then try signing in again. If it continues, contact support with the reference ID below.";
    } else if (failureStage === "session_persistence") {
      message = "Your sign-in was verified, but we could not save your session. Please try again in a minute. If it continues, contact support with the reference ID below.";
    } else if (failureStage === "member_provisioning") {
      message = "Your sign-in was verified, but we could not finish setting up your member account. Please contact support with the reference ID below.";
    } else if (failureStage === "member_database_lookup") {
      message = "We could not look up your member account because the database request failed. Please try again shortly and share the reference ID with support if it continues.";
    } else {
      message = "We could not finish signing you in. Please try again. If it continues, contact support with the reference ID below.";
    }

    logError("auth.session_exchange_failed", {
      referenceId,
      stage: failureStage,
      code: errorCode,
      error: String(err?.message || "Unknown authentication error").slice(0, 500),
    });
    return NextResponse.json(
      { error: "server_error", code: errorCode, referenceId, message },
      { status: 500 }
    );
  }
}
