import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { logError } from "@/lib/server/log";
import { claimInvite } from "@/lib/server/invites-core";

export const dynamic = "force-dynamic";

// Claim an invite for the signed-in member. Single-use: the first valid claim
// wins, and nothing is credited here — the reward lands later when the invitee
// publishes their first post (rewardActivation in the posts route).
export async function POST(req, { params }) {
  const { token } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const limited = rateLimitGuard(`invite-claim:${user.uid}`, { limit: 20, windowMs: 3600000 });
  if (limited) return limited;

  try {
    const prisma = getPrisma();
    const result = await claimInvite({ prisma, token, claimerUid: user.uid });
    if (!result.ok) {
      const messageText = result.message || result.error;
      return NextResponse.json({ error: messageText }, { status: 400 });
    }

    const userDoc = await getUserDoc(user.uid);
    const claimerName = userDoc?.name || user.name || user.email?.split("@")[0] || "Member";

    const inviterRow = await prisma.user.findUnique({
      where: { id: result.invite.inviterUid },
      select: { name: true, role: true },
    });

    return NextResponse.json({
      ok: true,
      inviteId: result.invite.id,
      inviter: {
        uid: result.invite.inviterUid,
        name: inviterRow?.name || "Member",
      },
      link: `/invite/${token}`,
    });
  } catch (err) {
    logError("invites.prisma_claim_failed", { uid: user.uid, error: err.message });
    return NextResponse.json({ error: "Could not claim this invite" }, { status: 500 });
  }
}
