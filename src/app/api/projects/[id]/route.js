import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { getPrisma } from "@/lib/db/prisma";
import { PROJECT_STATUSES, serializeProject } from "@/lib/server/projects";
import { rateLimitGuard } from "@/lib/server/rate-limit";

function clean(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function imageUrls(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((url) => typeof url === "string" && /^(https?:\/\/|data:image\/)/i.test(url.trim())).map((url) => url.trim()))].slice(0, 6);
}

export async function PATCH(req, { params }) {
  const { id } = await params;
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;
  const limited = rateLimitGuard(`project-write:${auth.user.uid}`, { limit: 30 });
  if (limited) return limited;
  const prisma = getPrisma();
  const existing = await prisma.project.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!existing) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (existing.userId !== auth.user.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const data = {};
  if (body.title !== undefined) {
    const title = clean(body.title, 120);
    if (!title) return NextResponse.json({ error: "Project title is required" }, { status: 400 });
    data.title = title;
  }
  for (const [key, max] of [["description", 2000], ["craft", 80], ["projectType", 80], ["yarnDetails", 160], ["hookSize", 80]]) {
    if (body[key] !== undefined) data[key] = clean(body[key], max) || null;
  }
  if (body.status !== undefined) {
    if (!PROJECT_STATUSES.includes(body.status)) return NextResponse.json({ error: "Invalid project status" }, { status: 400 });
    data.status = body.status;
  }
  if (body.imageUrls !== undefined) data.imageUrls = imageUrls(body.imageUrls);
  try {
    const project = await prisma.$transaction(async (tx) => {
      if (body.featured === true) await tx.project.updateMany({ where: { userId: auth.user.uid }, data: { featured: false } });
      if (body.featured !== undefined) data.featured = body.featured === true;
      return tx.project.update({ where: { id }, data });
    });
    return NextResponse.json({ project: serializeProject(project) });
  } catch {
    return NextResponse.json({ error: "Could not update project" }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const { id } = await params;
  const auth = await requireActiveMember();
  const denied = guardJson(auth);
  if (denied) return denied;
  const limited = rateLimitGuard(`project-delete:${auth.user.uid}`, { limit: 20 });
  if (limited) return limited;
  const prisma = getPrisma();
  const existing = await prisma.project.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (existing.userId !== auth.user.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.project.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
