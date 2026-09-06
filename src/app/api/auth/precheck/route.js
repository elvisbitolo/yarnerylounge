import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { logError } from "@/lib/server/log";
import { SHOPIFY_UPGRADE_URL } from "@/lib/server/shopify";

export const dynamic = "force-dynamic";

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

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

    const snap = await adminDb()
      .collection("users")
      .where("email", "==", clean)
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json(
        {
          error: "not_prepaid",
          message: "This account needs a paid Speakeasy membership before joining.",
          redirect: SHOPIFY_UPGRADE_URL,
        },
        { status: 403 }
      );
    }

    const doc = snap.docs[0];
    const data = doc.data();
    const role = data.role || "member";
    const staff = role === "owner" || role === "moderator";

    if (data.paymentStatus !== "paid" && !staff) {
      return NextResponse.json(
        {
          error: "not_prepaid",
          message: "Your Speakeasy membership is not active. Please renew to enter the lounge.",
          redirect: SHOPIFY_UPGRADE_URL,
        },
        { status: 403 }
      );
    }

    const expiresAtMs = toMillis(data.expiresAt);
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
      plan: data.plan || "flirting",
      role,
      isNew: doc.id === clean,
    });
  } catch (err) {
    logError("auth.precheck_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to check membership" }, { status: 500 });
  }
}