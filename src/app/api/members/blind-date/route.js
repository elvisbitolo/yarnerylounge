import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { getCapabilities, canUseMatchmaker } from "@/lib/server/capabilities";
import { pickDailyBlindDate } from "@/lib/server/blind-date";
import { getMatchDecision } from "@/lib/server/match-decisions";
import { rateLimitGuard } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const caps = await getCapabilities(auth.user.uid);
  if (!canUseMatchmaker(caps)) {
    return NextResponse.json(
      { error: "Matchmaker is for premium members" },
      { status: 403 }
    );
  }

  const limited = rateLimitGuard(`blind-date:${auth.user.uid}`, { limit: 20 });
  if (limited) return limited;

  const pick = await pickDailyBlindDate(auth.user.uid);
  if (!pick) {
    return NextResponse.json({ member: null });
  }

  const { member, ...summary } = pick;
  const decision = await getMatchDecision(auth.user.uid, summary.date);
  return NextResponse.json({ member: summary, decision: decision?.decision || null });
}
