import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { logError } from "@/lib/server/log";
import { getPublicInvite, revokeInvite } from "@/lib/server/invites-core";

export const dynamic = "force-dynamic";

// Public, unauthenticated meta for a warm invite landing page. Reveals only the
// inviter's name/photo and the personal note — never the token (it's already in
// the path) or any attribution data. IP-rate-limited to stop link scraping.
export async function GET(req, { params }) {
  const { token } = await params;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = rateLimitGuard(`invite-public:${ip}`, { limit: 40 });
  if (limited) return limited;

  try {
    const prisma = getPrisma();
    const invite = await getPublicInvite({ prisma, token });
    if (!invite) {
      return NextResponse.json({ error: "invite_not_found", message: "This invite doesn't exist." }, { status: 404 });
    }
    return NextResponse.json({ invite });
  } catch (err) {
    logError("invites.prisma_public_failed", { error: err.message });
    return NextResponse.json({ error: "Could not load this invite" }, { status: 500 });
  }
}

// Revoke a member's own outbound invite (only while it is still pending). Keyed
// by token rather than a separate [id] route — tokens are unique, and it keeps
// the invites routes to a single dynamic segment.
export async function DELETE(req, { params }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { token } = await params;

  const limited = rateLimitGuard(`invite-revoke:${user.uid}`, { limit: 30 });
  if (limited) return limited;

  try {
    const prisma = getPrisma();
    const result = await revokeInvite({ prisma, token, inviterUid: user.uid });
    if (!result.ok) {
      const messageText = result.message || result.error;
      return NextResponse.json({ error: messageText }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("invites.prisma_revoke_failed", { uid: user.uid, token, error: err.message });
    return NextResponse.json({ error: "Failed to revoke invite" }, { status: 500 });
  }
}