import { NextResponse } from "next/server";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { logError } from "@/lib/server/log";
import { SHOPIFY_UPGRADE_URL } from "@/lib/server/shopify";
import { getUserByEmail } from "@/lib/server/auth";
import { isOpenAccess, OPEN_ACCESS_PLAN } from "@/lib/server/access-policy";
import { toMillis } from "@/lib/server/user-core";

export const dynamic = "force-dynamic";

const STAFF_ROLES = ["owner", "moderator"];

export async function POST(req) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const limited = rateLimitGuard(`precheck-ip:${ip}`, { limit: 30 });
    if (limited) return limited;

    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }
    const clean = email.toLowerCase().trim();

    // Open-access mode admits everyone while the community ramps up.
    if (isOpenAccess()) {
      return NextResponse.json({
        allowed: true,
        email: clean,
        plan: OPEN_ACCESS_PLAN,
        role: "member",
        openAccess: true,
        isNew: true,
      });
    }

    const userDoc = await getUserByEmail(clean);
    if (!userDoc) {
      return NextResponse.json(
        {
          error: "not_prepaid",
          message: "This account needs a paid Speakeasy membership before joining.",
          redirect: SHOPIFY_UPGRADE_URL,
        },
        { status: 403 }
      );
    }

    const role = userDoc.role || "member";
    const staff = STAFF_ROLES.includes(role);

    if (userDoc.paymentStatus !== "paid" && !staff) {
      return NextResponse.json(
        {
          error: "not_prepaid",
          message: "Your Speakeasy membership is not active. Please renew to enter the lounge.",
          redirect: SHOPIFY_UPGRADE_URL,
        },
        { status: 403 }
      );
    }

    const expiresAtMs = toMillis(userDoc.expiresAt);
    if (!staff && expiresAtMs > 0 && expiresAtMs < Date.now()) {
      return NextResponse.json(
        {
          error: "expired",
          message: "Your Speakeasy membership has expired. Renew to come back inside.",
          redirect: SHOPIFY_UPGRADE_URL,
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      allowed: true,
      email: clean,
      plan: userDoc.plan || "flirting",
      role,
      isNew: userDoc.id === clean,
    });
  } catch (err) {
    logError("auth.precheck_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to check membership" }, { status: 500 });
  }
}