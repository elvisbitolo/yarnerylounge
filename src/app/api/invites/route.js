import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { logError } from "@/lib/server/log";
import { createInvite, listInvites } from "@/lib/server/invites-core";

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
  const message = typeof body.message === "string" ? body.message : "";

  try {
    const prisma = getPrisma();
    const result = await createInvite({ prisma, inviterUid: user.uid, recipientName, message });
    if (!result.ok) {
      const messageText = result.message || result.error;
      return NextResponse.json({ error: messageText }, { status: 400 });
    }
    return NextResponse.json({ invite: result.invite, link: `/invite/${result.invite.token}` });
  } catch (err) {
    logError("invites.prisma_create_failed", { uid: user.uid, error: err.message });
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }
}