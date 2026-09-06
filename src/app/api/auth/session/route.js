import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { AUTH_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/server/auth";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { logError } from "@/lib/server/log";

// Blocks cookie-CSRF-style cross-origin session requests. Requests without an
// Origin header (curl, servers) are allowed; browsers are expected to send one.
// The Origin must match the Host the request was addressed to, which is what a
// real browser sends for same-site requests and what malicious cross-site
// forms/fetches cannot forge.
function assertSameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const host = req.headers.get("host");
  if (!host) return null;
  try {
    const parsed = new URL(origin);
    if (parsed.host === host && (parsed.protocol === "https:" || parsed.protocol === "http:")) {
      return null;
    }
  } catch {
    // invalid origin — fall through and block
  }
  return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
}

// Returns true when an email already maps to an owner/moderator profile (used
// to let staff through the signup wall when they are not ordering on Shopify).
async function staffByEmail(users, email) {
  if (!email) return false;
  const snap = await users
    .where("email", "==", email)
    .where("role", "in", ["owner", "moderator"])
    .limit(1)
    .get();
  return !snap.empty;
}

export async function POST(req) {
  const crossOrigin = assertSameOrigin(req);
  if (crossOrigin) return crossOrigin;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = rateLimitGuard(`session-ip:${ip}`, { limit: 30 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { idToken, name } = body;
    if (!idToken) {
      return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
    }

    const decoded = await adminAuth().verifyIdToken(idToken);

    const perAccount = rateLimitGuard(`session-uid:${decoded.uid}`, { limit: 20 });
    if (perAccount) return perAccount;

    if (decoded.email && !decoded.email_verified) {
      return NextResponse.json(
        { error: "email_not_verified" },
        { status: 403 }
      );
    }

    const users = adminDb().collection("users");
    const userRef = users.doc(decoded.uid);
    const snap = await userRef.get();
    let isNewUser = false;
    if (!snap.exists) {
      const prepaidEmail = (decoded.email || "").toLowerCase().trim();

      // Find a valid email-keyed prepaid record (created by the Shopify
      // webhook for a paid checkout that has not signed up yet).
      let prepaid = null;
      if (prepaidEmail) {
        const found = await users
          .where("email", "==", prepaidEmail)
          .where("isPrePaid", "==", true)
          .limit(1)
          .get();
        if (!found.empty) {
          const doc = found.docs[0];
          const data = doc.data();
          if (!data.expiresAt || new Date(data.expiresAt) > new Date()) {
            prepaid = data;
          } else {
            // Expired pre-paid record — discard and keep free account.
            await users.doc(doc.id).delete().catch(() => {});
          }
        }
      }

      // Hard signup wall: registration is only allowed for paid Speakeasy
      // checkouts (email-keyed prepaid record) or staff accounts. Anyone else
      // is sent back to the speakeasy page. This is the server-side guard so a
      // client that bypasses the pre-check still cannot create a session.
      const isStaffSignup =
        prepaid?.role === "owner" ||
        prepaid?.role === "moderator" ||
        (await staffByEmail(users, prepaidEmail));
      if (!prepaid && !isStaffSignup) {
        if (!name) {
          return NextResponse.json(
            { error: "no_account" },
            { status: 409 }
          );
        }
        return NextResponse.json(
          {
            error: "not_prepaid",
            message: "This account needs a paid Speakeasy membership before joining.",
            redirect: process.env.NEXT_PUBLIC_SHOPIFY_PRICING_URL || "https://secretyarnery.com/pages/speakeasy",
          },
          { status: 403 }
        );
      }

      isNewUser = true;
      const memberName = name || decoded.name || decoded.email?.split("@")[0] || "Member";

      await userRef.set({
        name: memberName,
        email: decoded.email || "",
        photoURL: decoded.picture || "",
        role: prepaid?.role || "member",
        plan: prepaid?.plan || "flirting",
        paymentStatus: prepaid?.paymentStatus || "unpaid",
        isPrePaid: false,
        shopifyCustomerId: prepaid?.shopifyCustomerId || "",
        shopifyOrderId: prepaid?.shopifyOrderId || "",
        expiresAt: prepaid?.expiresAt || "",
        createdAt: new Date(),
      });

if (prepaid) {
        await adminDb()
          .collection("subscriptions")
          .doc(decoded.uid)
          .set({
            provider: "shopify",
            status: "active",
            plan: prepaid.plan,
            planName: prepaid.plan,
            tier: prepaid.plan,
            role: prepaid.role,
            shopifyCustomerId: prepaid.shopifyCustomerId || "",
            shopifyOrderId: prepaid.shopifyOrderId || "",
            currentPeriodEnd: prepaid.expiresAt
              ? new Date(prepaid.expiresAt)
              : null,
            updatedAt: new Date(),
          });
        // Remove the pre-paid placeholder doc so future webhooks resolve to the
        // real profile by uid, not the email-keyed record.
        await users.doc(prepaidEmail).delete().catch(() => {});
      }

      if (decoded.email) {
        const { sendEmail } = await import("@/lib/server/email");
        await sendEmail({
          to: decoded.email,
          subject: "Welcome to Secret Yarnery",
          text:
            `Hi ${memberName},\n\n` +
            `Welcome to Secret Yarnery! You're now a member of the community.\n\n` +
            `Here's what's inside:\n` +
            `- Live video rooms for real-time conversation\n` +
            `- Courses with lessons and progress tracking\n` +
            `- Events with RSVPs and reminders\n` +
            `- Groups, spaces, direct messages and a community feed\n\n` +
            `To start exploring: ${process.env.NEXT_PUBLIC_APP_URL || ""}/explore\n\n` +
            `We're glad you're here.\n\n— The Secret Yarnery Team`,
        }).catch((err) => {
          logError("email.welcome_failed", { uid: decoded.uid, error: err.message });
        });
      }

      const { runAutomations } = await import("@/lib/server/automations");
      runAutomations("new_member", {
        memberName,
        memberEmail: decoded.email || "",
        memberUid: decoded.uid,
        subjectUid: decoded.uid,
        subjectName: memberName,
      }).catch((err) => {
        logError("automation.new_member_failed", { uid: decoded.uid, error: err.message });
      });
    } else {
      const existing = snap.data();
      if (decoded.picture && !existing.photoURL) {
        await userRef.update({ photoURL: decoded.picture }).catch(() => {});
      }
    }

    const sessionCookie = await adminAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE_SECONDS * 1000,
    });

    const res = NextResponse.json({ ok: true, uid: decoded.uid, isNewUser });
    res.cookies.set(AUTH_COOKIE, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return res;
  } catch (err) {
    logError("auth.session_exchange_failed", { error: err.message });
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}
