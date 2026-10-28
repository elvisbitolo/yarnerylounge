import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCurrentUser } from "@/lib/server/auth";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { logError } from "@/lib/server/log";
import { validatePasswordChange } from "@/lib/password-policy";
import { sendEmail } from "@/lib/server/email";

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  // Password guesses must not become an online brute-force tool; five
  // attempts a quarter-hour per member is generous for a human.
  const limited = rateLimitGuard(`password-change:${user.uid}`, { limit: 5, windowMs: 15 * 60_000 });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const policyError = validatePasswordChange({
    currentPassword: String(body.currentPassword || ""),
    newPassword: String(body.newPassword || ""),
  });
  if (policyError) return NextResponse.json({ error: policyError }, { status: 400 });
  if (!user.email) {
    return NextResponse.json(
      { error: "This account has no email on file — ask a host to reset your password." },
      { status: 400 }
    );
  }

  try {
    // Prove the current password with a throwaway sign-in on a no-persistence
    // client: having hijacked a live session must not be enough to lock the
    // real owner out of the account. The tokens from this call are discarded.
    const verify = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { error: verifyErr } = await verify.auth.signInWithPassword({
      email: user.email,
      password: String(body.currentPassword),
    });
    if (verifyErr) {
      return NextResponse.json({ error: "Your current password is incorrect." }, { status: 400 });
    }

    const { default: supabaseAdmin } = await import("@/lib/supabase/service");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.uid, {
      password: String(body.newPassword),
    });
    if (error) {
      logError("password.update_failed", { uid: user.uid, error: error.message });
      return NextResponse.json({ error: "Could not update the password. Try again." }, { status: 500 });
    }
    // Security notifications are always sent, regardless of optional email
    // notification preferences. A delivery failure must not undo a password change.
    try {
      await sendEmail({
        to: user.email,
        subject: "Your Secret Yarnery password was changed",
        text: `The password for your Secret Yarnery account was changed successfully. If you made this change, no further action is needed. If you did not change your password, contact support immediately and secure your email account.`,
      });
    } catch (emailErr) {
      logError("password.security_email_failed", { uid: user.uid, error: emailErr?.message });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("password.update_failed", { uid: user.uid, error: err.message });
    return NextResponse.json({ error: "Could not update the password. Try again." }, { status: 500 });
  }
}
