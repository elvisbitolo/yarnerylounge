import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { pickDailyBlindDate } from "@/lib/server/blind-date";
import { getPrisma } from "@/lib/db/prisma";
import { getCapabilities, canUseMatchmaker } from "@/lib/server/capabilities";
import { logError } from "@/lib/server/log";
import { rateLimitGuard } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;

  const capabilities = await getCapabilities(auth.user.uid);
  if (!canUseMatchmaker(capabilities)) {
    return NextResponse.json({ error: "Matchmaker membership required" }, { status: 403 });
  }

  const limited = rateLimitGuard(`blind-date:${auth.user.uid}`, { limit: 20 });
  if (limited) return limited;

  const pick = await pickDailyBlindDate(auth.user.uid);
  if (!pick) {
    return NextResponse.json({ member: null });
  }

  const { member, ...summary } = pick;
  const prisma = getPrisma();
  let projects;
  try {
    projects = await prisma.project.findMany({
      where: { userId: member.id, status: "active" },
      orderBy: [{ featured: "desc" }, { updatedAt: "desc" }],
      take: 4,
      select: { id: true, title: true, craft: true, projectType: true, imageUrls: true },
    });
  } catch (error) {
    logError("blind-date.projects_read_failed", { error: error.message, memberId: member.id });
    return NextResponse.json({ error: "Could not load the daily match profile" }, { status: 500 });
  }

  const extra = member.extra && typeof member.extra === "object" ? member.extra : {};
  const lifestyleTags = [
    ...(Array.isArray(member.hobbies) ? member.hobbies : []),
    ...(Array.isArray(member.crafts) ? member.crafts : []),
    ...(Array.isArray(member.communityGoals) ? member.communityGoals : []),
    ...(Array.isArray(extra.communityGoals) ? extra.communityGoals : []),
    ...(Array.isArray(member.crochetMotivation) ? member.crochetMotivation : []),
  ].filter((tag, index, tags) => typeof tag === "string" && tag.trim() && tags.indexOf(tag) === index).slice(0, 10);

  return NextResponse.json({
    member: {
      ...summary,
      plan: member.plan || "flirting",
      role: member.role || "member",
      expiresAt: pick.expiresAt,
      lifestyleTags,
      projects: projects.map((project) => ({
        id: project.id,
        title: project.title,
        craft: project.craft,
        projectType: project.projectType,
        imageUrls: Array.isArray(project.imageUrls) ? project.imageUrls.slice(0, 3) : [],
      })),
    },
  });
}
