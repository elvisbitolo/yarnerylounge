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
    const existingUser = await prisma.user.findUnique({
      where: { id: identity.uid },
    });
    let isNewUser = false;
    if (!existingUser) {
      const prepaidEmail = (identity.email || "").toLowerCase().trim();

      let prepaid = null;
      if (prepaidEmail) {
        const found = await prisma.user.findFirst({
          where: { email: prepaidEmail, isPrePaid: true },
          select: { id: true },
        });
        prepaid = found;
      }

      const { isOpenAccess, OPEN_ACCESS_PLAN } = await import("@/lib/server/access-policy");
      const openAccess = isOpenAccess();

      if (!prepaid && !openAccess) {
        return NextResponse.json(
          { error: "not_prepaid", message: "This email is not registered as a member." },
          { status: 403 }
        );
      }

      const memberName = name || identity.name || prepaidEmail.split("@")[0] || "Member";

      await prisma.user.create({
        data: {
          id: identity.uid,
          name: memberName,
          email: identity.email || null,
          photoURL: identity.photoURL || null,
          role: "member",
          createdAt: new Date(),
        },
        select: { id: true },
      }).catch((err) => {
        if (err.code !== "P2002") throw err;
      });

      if (openAccess) {
        await prisma.subscription.upsert({
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

      if (identity.email) {
        const { sendEmail } = await import("@/lib/server/email");
        await sendEmail({
          to: identity.email,
          subject: "Welcome to Secret Yarnery",
          text:
            `Hi ${memberName},\n\n` +
            `Welcome to Secret Yarnery! You're now a member of the community.\n\n` +
            `Here's what's inside:\n` +
            `- Live video rooms for real-time conversation\n` +
            `- Courses with lessons and progress tracking\n` +
            `- Events with RSVPs and reminders\n` +
            `- Groups, spaces, direct messages and a community feed\n\n` +
            `To start exploring: ${process.env.NEXT_PUBLIC_APP_URL || CANONICAL_ORIGIN}/explore\n\n` +
            `We're glad you're here.\n\n— The Secret Yarnery Team`,
        }).catch((err) => {
          logError("email.welcome_failed", { uid: identity.uid, error: err.message });
        });
      }

      const { runAutomations } = await import("@/lib/server/automations");
      runAutomations("new_member", {
        memberName,
        memberEmail: identity.email || "",
        memberUid: identity.uid,
        subjectUid: identity.uid,
        subjectName: memberName,
      }).catch((err) => {
        logError("automation.new_member_failed", { uid: identity.uid, error: err.message });
      });
    } else {
      if (identity.photoURL && !existingUser.photoURL) {
        await prisma.user.update({ where: { id: identity.uid }, data: { photoURL: identity.photoURL } }).catch(() => {});
      }
    }

    const sid = await createSession({
      uid: identity.uid,
      accessToken: supabaseToken,
      refreshToken: supabaseRefreshToken || null,
    });
    if (!sid) {
      throw new Error("session row not created");
    }

    const res = NextResponse.json({ ok: true, uid: identity.uid, isNewUser });
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
