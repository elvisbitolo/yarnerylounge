import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { logError } from "@/lib/server/log";
import { pushConfigured, sendPushToUser } from "@/lib/server/push";

export const dynamic = "force-dynamic";

// Sends a real push only to the authenticated member's own registered devices.
// This diagnostic never returns VAPID keys, endpoints, or subscription secrets.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "not_signed_in" }, { status: 401 });
  }

  const limited = rateLimitGuard(`push-self-test:${user.uid}`, { limit: 3 });
  if (limited) return limited;

  if (!pushConfigured()) {
    return NextResponse.json(
      { ok: false, reason: "vapid_not_configured", message: "One or more server-side VAPID settings are missing." },
      { status: 503 }
    );
  }

  const prisma = getPrisma();
  if (!prisma) {
    return NextResponse.json({ ok: false, reason: "database_unavailable" }, { status: 503 });
  }

  try {
    const subscriptions = await prisma.pushSubscription.count({ where: { userId: user.uid } });
    if (!subscriptions) {
      return NextResponse.json(
        { ok: false, reason: "no_subscription", message: "This account has no saved push subscription. Enable push on this browser first." },
        { status: 409 }
      );
    }

    const result = await sendPushToUser(user.uid, {
      title: "Secret Yarnery test",
      body: "Web push is reaching the push service. If you can see this alert, device delivery works.",
      url: "/notifications",
    });

    if (!result.sent) {
      return NextResponse.json(
        { ok: false, reason: result.reason, subscriptions, message: "No push service accepted the test. Check server logs for push.send_failed." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      acceptedByPushService: result.sent,
      subscriptions,
      message: "The push service accepted the test. Check this browser/device for the notification.",
    });
  } catch (error) {
    logError("push.self_test_failed", { userId: user.uid, error: error?.message });
    return NextResponse.json({ ok: false, reason: "diagnostic_failed" }, { status: 500 });
  }
}
