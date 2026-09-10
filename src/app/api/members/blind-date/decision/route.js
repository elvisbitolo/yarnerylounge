import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { getCapabilities, canUseMatchmaker } from "@/lib/server/capabilities";
import { pickDailyBlindDate } from "@/lib/server/blind-date";
import { getMatchDecision, saveMatchDecision } from "@/lib/server/match-decisions";
import { rateLimitGuard } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;
  const caps = await getCapabilities(auth.user.uid);
  if (!canUseMatchmaker(caps)) return NextResponse.json({ error: "Matchmaker is for premium members" }, { status: 403 });
  const decision = await getMatchDecision(auth.user.uid);
  return NextResponse.json({ decision: decision?.decision || null });
}

export async function POST(req) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;
  const caps = await getCapabilities(auth.user.uid);
  if (!canUseMatchmaker(caps)) return NextResponse.json({ error: "Matchmaker is for premium members" }, { status: 403 });
  const limited = rateLimitGuard(`blind-date-decision:${auth.user.uid}`, { limit: 12 });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  if (body?.decision !== "accepted" && body?.decision !== "passed") {
    return NextResponse.json({ error: "Decision must be accepted or passed" }, { status: 400 });
  }
  const pick = await pickDailyBlindDate(auth.user.uid);
  if (!pick?.memberId) return NextResponse.json({ error: "No daily match is available" }, { status: 409 });

  const result = await saveMatchDecision({
    uid: auth.user.uid,
    targetUserId: pick.memberId,
    date: pick.date,
    decision: body.decision,
  });
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ decision: result.decision });
}
