import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { sendEmail } from "@/lib/server/email";
import { logError } from "@/lib/server/log";
import { CANONICAL_ORIGIN } from "@/lib/server/origin";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!user.email) {
    return NextResponse.json({ error: "Your account has no email address" }, { status: 400 });
  }

  const limited = rateLimitGuard(`email-test:${user.uid}`, {
    limit: 3,
    windowMs: 60 * 60 * 1000,
  });
  if (limited) return limited;

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Email delivery is not configured on the server" }, { status: 503 });
  }

  const site = process.env.NEXT_PUBLIC_APP_URL || CANONICAL_ORIGIN;
  try {
    const result = await sendEmail({
      to: user.email,
      subject: "Secret Yarnery email delivery test",
      text: `This is a test email for your Secret Yarnery account. If you received it, outbound email delivery is working.\n\nOpen your account: ${site}/account`,
    });
    if (result?.skipped) {
      return NextResponse.json({ error: "Email delivery was skipped by server configuration" }, { status: 503 });
    }
    return NextResponse.json({
      ok: true,
      accepted: true,
      destination: user.email,
      message: "The email provider accepted the test message. Check your inbox and spam folder.",
    });
  } catch (error) {
    logError("email.test_failed", { uid: user.uid, error: error?.message });
    return NextResponse.json({ error: "The email provider rejected the test message" }, { status: 502 });
  }
}
