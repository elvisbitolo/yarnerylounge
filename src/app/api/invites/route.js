import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { logError } from "@/lib/server/log";
import { sendEmail } from "@/lib/server/email";
import { CANONICAL_ORIGIN } from "@/lib/server/origin";
import { createInvite, listInvites, INVITE_TTL_MS } from "@/lib/server/invites-core";

export const dynamic = "force-dynamic";

// Own-invite manager: history for the /invite page.
export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const prisma = getPrisma();
    const invites = await listInvites({ prisma, inviterUid: user.uid });
    return NextResponse.json({ invites });
  } catch (err) {
    logError("invites.prisma_list_failed", { uid: user.uid, error: err.message });
    return NextResponse.json({ error: "Failed to load invites" }, { status: 500 });
  }
}

// Compose the plain-text invite email. No cold marketing: this is sent only
// after the member explicitly typed an address and hit "Invite".
function inviteEmail({ inviterName, recipientName, message, link }) {
  const lines = [];
  if (recipientName) lines.push(`Hey ${recipientName},`);
  lines.push(`${inviterName} invited you to Secret Yarnery — a cozy online home for crafters, makers and friends.`);
  if (message) lines.push(`\n${message}`);
  lines.push(
    `\nAccept your invite here:`,
    `${link}`,
    `\nThe invitation is just for you and expires in 7 days.`
  );
  return lines.join("\n");
}

// Create a new personal invite link.
export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const limited = rateLimitGuard(`invite-create:${user.uid}`, { limit: 20, windowMs: 3600000 });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const recipientName = typeof body.recipientName === "string" ? body.recipientName : "";
  const recipientEmail = typeof body.recipientEmail === "string" ? body.recipientEmail.trim() : "";
  const message = typeof body.message === "string" ? body.message : "";

  try {
    const prisma = getPrisma();
    const result = await createInvite({ prisma, inviterUid: user.uid, recipientName, recipientEmail, message });
    if (!result.ok) {
      const messageText = result.message || result.error;
      return NextResponse.json({ error: messageText }, { status: 400 });
    }
    const invite = result.invite;
    const link = `${process.env.NEXT_PUBLIC_APP_URL || CANONICAL_ORIGIN}/invite/${invite.token}`;

    let emailed = false;
    if (invite.recipientEmail) {
      try {
        await sendEmail({
          to: invite.recipientEmail,
          subject: `${user.name || "A member"} invited you to Secret Yarnery`,
          text: inviteEmail({
            inviterName: user.name || "A member",
            recipientName: invite.recipientName,
            message: invite.message,
            link,
          }),
        });
        emailed = true;
      } catch (err) {
        // The invite exists regardless; the member still has the copyable link.
        logError("email.invite_failed", { uid: user.uid, inviteId: invite.id, email: invite.recipientEmail, error: err.message });
      }
    }

    return NextResponse.json({ invite, link, emailed, ttlHours: INVITE_TTL_MS / 3600000 });
  } catch (err) {
    logError("invites.prisma_create_failed", { uid: user.uid, error: err.message });
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }
}