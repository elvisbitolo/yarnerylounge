import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { logError } from "@/lib/server/log";
import { getPrisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const VALID_SKILLS = ["beginner", "intermediate", "advanced", "expert"];
const VALID_CRAFTS = ["crochet", "knitting", "weaving", "spinning", "dyeing", "embroidery", "macrame"];
const VALID_PROJECTS = ["amigurumi", "garments", "blankets", "accessories", "home-decor", "baby-items", "jewelry"];
const VALID_YARNS = ["lace-fingering", "sport-dk", "worsted-aran", "bulky-super", "no-preference"];
const VALID_HOOKS = ["small", "medium", "large", "mixed"];
const VALID_GOALS = ["learn", "share", "patterns", "connect", "marketplace", "challenges", "courses"];

function validate(body) {
  const errors = [];
  if (!VALID_SKILLS.includes(body.skillLevel)) errors.push("Invalid skill level");
  if (!Array.isArray(body.craftInterests) || !body.craftInterests.some((c) => VALID_CRAFTS.includes(c))) {
    errors.push("Select at least one craft");
  }
  if (!Array.isArray(body.projectTypes) || !body.projectTypes.some((p) => VALID_PROJECTS.includes(p))) {
    errors.push("Select at least one project type");
  }
  if (!VALID_YARNS.includes(body.yarnPreference)) errors.push("Invalid yarn preference");
  if (!VALID_HOOKS.includes(body.hookSize)) errors.push("Invalid hook size");
  if (!Array.isArray(body.communityGoals) || !body.communityGoals.some((g) => VALID_GOALS.includes(g))) {
    errors.push("Select at least one goal");
  }
  return errors;
}

export async function POST(req) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const errors = validate(body);
  if (errors.length > 0) {
    return NextResponse.json({ error: errors[0] }, { status: 400 });
  }

  const craftInterests = body.craftInterests.filter((c) => VALID_CRAFTS.includes(c));
  const projectTypes = body.projectTypes.filter((p) => VALID_PROJECTS.includes(p));
  const communityGoals = body.communityGoals.filter((g) => VALID_GOALS.includes(g));
  const timezone = typeof body.timezone === "string" && body.timezone.length <= 80
    ? body.timezone.trim()
    : "";
  const profile = {
    skillLevel: body.skillLevel,
    craftInterests,
    projectTypes,
    yarnPreference: body.yarnPreference,
    hookSize: body.hookSize,
    communityGoals,
    onboardingCompleted: true,
    onboardingCompletedAt: new Date(),
  };

  try {
    const prisma = getPrisma();
    const existing = await prisma.user.findUnique({
      where: { id: auth.user.uid },
      select: { id: true, extra: true },
    });
    const extra = { ...(existing?.extra && typeof existing.extra === "object" ? existing.extra : {}) };
    if (timezone) extra.timezone = timezone;
    if (existing) {
      await prisma.user.update({
        where: { id: auth.user.uid },
        data: { ...profile, extra, updatedAt: new Date() },
      });
    } else {
      await prisma.user.create({
        data: {
          id: auth.user.uid,
          name: auth.user.name || auth.user.email || "",
          extra: timezone ? { timezone } : undefined,
          ...profile,
        },
      });
    }
  } catch (err) {
    logError("onboarding.save_failed", { error: err.message, uid: auth.user.uid });
    return NextResponse.json({ error: "Could not save your profile" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET(req) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const prisma = getPrisma();
  let data = null;
  try {
    data = await prisma.user.findUnique({
      where: { id: auth.user.uid },
      select: {
        onboardingCompleted: true,
        skillLevel: true,
        craftInterests: true,
        projectTypes: true,
        yarnPreference: true,
        hookSize: true,
        communityGoals: true,
      },
    });
  } catch (err) {
    logError("onboarding.prisma_read_failed", { error: err.message });
  }
  const row = data || {};

  return NextResponse.json({
    completed: !!row.onboardingCompleted,
    skillLevel: row.skillLevel || "",
    craftInterests: row.craftInterests || [],
    projectTypes: row.projectTypes || [],
    yarnPreference: row.yarnPreference || "",
    hookSize: row.hookSize || "",
    communityGoals: row.communityGoals || [],
  });
}
