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
        photoURL: true,
        createdAt: true,
        role: true,
        roleLabel: true,
        plan: true,
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
    const subMap = new Map(subs.map((sub) => [sub.id, sub]));
    const members = users.map((user) => {
      const sub = subMap.get(user.id) || null;
      const active = isActiveSub(sub);
      return {
        id: user.id,
        name: user.name || "",
        email: user.email || "",
        photoURL: user.photoURL || "",
        createdAt: user.createdAt,
        role: user.role || "member",
        roleLabel: user.roleLabel || "",
        plan: (sub && active ? sub.tier : null) || user.plan || "flirting",
        suspended: user.suspended || false,
        foundingMember: !!user.foundingMember,
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
