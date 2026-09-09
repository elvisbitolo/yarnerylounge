import { NextResponse } from "next/server";
import { requireModerator, guardJson } from "@/lib/server/authorize";
import { isActiveSub } from "@/lib/server/billing";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function GET() {
  const auth = await requireModerator();
  const denied = guardJson(auth);
  if (denied) return denied;

  const prisma = getPrisma();
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      take: 500,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        suspended: true,
        foundingMember: true,
      },
    });
    const subs = await prisma.subscription.findMany({
      take: 1000,
      select: {
        id: true,
        tier: true,
        status: true,
        currentPeriodEnd: true,
        trialEnd: true,
      },
    });
    const subMap = new Map(subs.map((s) => [s.id, s]));
    const members = users.map((u) => {
      const sub = subMap.get(u.id) || null;
      const active = isActiveSub(sub);
      return {
        id: u.id,
        name: u.name || "",
        email: u.email || "",
        role: u.role || "member",
        suspended: u.suspended || false,
        foundingMember: !!u.foundingMember,
        tier: sub && active ? sub.tier || "lounge" : "",
        subStatus: active
          ? sub.status === "trialing"
            ? "trial"
            : "active"
          : sub
            ? "inactive"
            : "none",
      };
    });
    return NextResponse.json({ members });
  } catch (err) {
    logError("admin.members.prisma_failed", { error: err.message });
    return NextResponse.json({ members: [] });
  }
}