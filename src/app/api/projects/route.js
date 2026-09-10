import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { getPrisma } from "@/lib/db/prisma";
import { listProjects, PROJECT_STATUSES, serializeProject } from "@/lib/server/projects";
import { rateLimitGuard } from "@/lib/server/rate-limit";

function clean(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function imageUrls(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((url) => typeof url === "string" && /^(https?:\/\/|data:image\/)/i.test(url.trim())).map((url) => url.trim()))].slice(0, 6);
}

export async function GET(req) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;
  const userId = req.nextUrl.searchParams.get("userId") || auth.user.uid;
  const projects = await listProjects(userId, { includeArchived: userId === auth.user.uid && req.nextUrl.searchParams.get("includeArchived") === "1" });
  return NextResponse.json({ projects });
}

export async function POST(req) {
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;
  const limited = rateLimitGuard(`projects-write:${auth.user.uid}`, { limit: 20 });
  if (limited) return limited;
  const body = await req.json().catch(() => ({}));
  const title = clean(body.title, 120);
  if (!title) return NextResponse.json({ error: "Project title is required" }, { status: 400 });
  const status = PROJECT_STATUSES.includes(body.status) ? body.status : "active";
  const urls = imageUrls(body.imageUrls);
  if (urls.length > 6) return NextResponse.json({ error: "A project can have up to six images" }, { status: 400 });

  const prisma = getPrisma();
  try {
    const project = await prisma.$transaction(async (tx) => {
      if (body.featured === true) {
        await tx.project.updateMany({ where: { userId: auth.user.uid }, data: { featured: false } });
      }
      return tx.project.create({
        data: {
          userId: auth.user.uid,
          title,
          description: clean(body.description, 2000) || null,
          status,
          craft: clean(body.craft, 80) || null,
          projectType: clean(body.projectType, 80) || null,
          yarnDetails: clean(body.yarnDetails, 160) || null,
          hookSize: clean(body.hookSize, 80) || null,
          imageUrls: urls,
          featured: body.featured === true,
        },
      });
    });
    return NextResponse.json({ project: serializeProject(project) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not create project" }, { status: 500 });
  }
}
