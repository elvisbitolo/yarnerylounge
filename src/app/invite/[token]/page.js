import { cookies } from "next/headers";
import { AUTH_COOKIE } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { getPublicInvite } from "@/lib/server/invites-core";
import { logError } from "@/lib/server/log";
import InviteLanding from "./InviteLanding";

export const dynamic = "force-dynamic";

// Public, warm handoff page behind every invite link. The invite meta is
// resolved server-side so the first paint already shows the inviter's name and
// note (no loading flash), and the client component only handles the claim
// action and the signed-out hand-off.
export default async function InvitePage({ params }) {
  const { token } = await params;
  const cookieStore = await cookies();
  const hasSession = Boolean(cookieStore.get(AUTH_COOKIE)?.value);

  let invite = null;
  try {
    const prisma = getPrisma();
    invite = await getPublicInvite({ prisma, token });
  } catch (err) {
    logError("invites.page_fetch_failed", { error: err.message });
  }

  return <InviteLanding token={token} hasSession={hasSession} initial={invite} />;
}