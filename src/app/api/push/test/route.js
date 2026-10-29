import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { sendPushToUser } from "@/lib/server/push";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const result = await sendPushToUser(user.uid, {
      title: "Secret Yarnery test",
      body: "Push notifications are reaching this device.",
      url: "/account",
    });

    if (result.sent > 0) {
      return NextResponse.json({ ok: true, ...result });
    }

    const messages = {
      unconfigured: "Push delivery is not configured on the production server. Check the VAPID environment variables.",
      no_subscription: "This account has no saved push subscription. Enable notifications on this device first.",
      no_db: "The notification database is unavailable.",
      read_failed: "The server could not read this account's device subscriptions.",
      all_failed: "The server found a subscription but the push provider rejected delivery. Check the server logs and VAPID keys.",
      invalid: "The test notification could not be created.",
    };
    return NextResponse.json({
      ok: false,
      ...result,
      error: messages[result.reason] || "The test notification could not be delivered.",
    }, { status: result.reason === "unconfigured" ? 503 : 200 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: "Push test failed unexpectedly. Check the server logs for details.",
    }, { status: 500 });
  }
}
