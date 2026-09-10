import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { getCapabilities, canUseMatchmaker } from "@/lib/server/capabilities";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { BLOCKED_KEY, isSafetyId } from "@/lib/server/member-safety";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const caps = await getCapabilities(auth.user.uid);
  if (!canUseMatchmaker(caps)) return NextResponse.json({ members: [] });

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ members: [], skillLevel: "" });

  try {
    const me = await prisma.user.findUnique({
      where: { id: auth.user.uid },
      select: { skillLevel: true, extra: true },
    });
    const skillLevel = String(me?.skillLevel || me?.extra?.skillLevel || "").trim().toLowerCase();
    if (!skillLevel) return NextResponse.json({ members: [], skillLevel: "" });

    const rows = await prisma.user.findMany({
      take: 500,
      where: { id: { not: auth.user.uid }, suspended: { not: true } },
      select: {
        id: true,
        name: true,
        headline: true,
        photoURL: true,
        country: true,
        skillLevel: true,
        extra: true,
      },
    });
    const members = rows
      .filter((u) => u.extra && typeof u.extra === "object" && u.extra.profileVisibility !== "private")
      .filter((member) => String(member.skillLevel || member.extra?.skillLevel || "").trim().toLowerCase() === skillLevel)
      .filter((member) => !isSafetyId(me?.extra, BLOCKED_KEY, member.id) && !isSafetyId(member.extra, BLOCKED_KEY, auth.user.uid))
      .map((member) => ({
        id: member.id,
        name: member.name || "Member",
        headline: member.headline || "",
        photoURL: member.photoURL || "",
        country: member.country || "",
        skillLevel: member.skillLevel || skillLevel,
      }));

    return NextResponse.json({ members, skillLevel });
  } catch (err) {
    logError("skill-level.prisma_read_failed", { error: err.message });
    return NextResponse.json({ members: [], skillLevel: "" });
  }
}
