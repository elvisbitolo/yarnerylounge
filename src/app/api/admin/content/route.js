import { NextResponse } from "next/server";
import { requireModerator, guardJson } from "@/lib/server/authorize";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

const PER_KIND = 8;
const MAX_QUERY_LENGTH = 120;

const KINDS = {
  member: { label: "Member", href: (r) => `/members/${r.id}` },
  post: { label: "Post", href: () => "/feed" },
  article: { label: "Article", href: (r) => `/articles/${r.id}` },
  room: { label: "Lounge", href: () => "/admin/rooms" },
  space: { label: "Space", href: (r) => `/spaces/${r.slug}` },
  group: { label: "Group", href: (r) => `/groups/${r.slug}` },
  event: { label: "Event", href: (r) => `/events/${r.id}` },
  course: { label: "Course", href: (r) => `/admin/courses/${r.id}` },
  recording: { label: "Recording", href: () => "/admin/recordings" },
};

function iso(value) {
  return value instanceof Date ? value.toISOString() : null;
}

function excerpt(text, max = 140) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export async function GET(req) {
  const auth = await requireModerator();
  const denied = guardJson(auth);
  if (denied) return denied;

  const prisma = getPrisma();
  if (!prisma) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const params = req.nextUrl.searchParams;
  const raw = (params.get("q") || "").trim().slice(0, MAX_QUERY_LENGTH);
  const kindFilter = params.get("kind");
  const only = kindFilter && Object.hasOwn(KINDS, kindFilter) ? kindFilter : null;

  if (raw.length === 1) {
    return NextResponse.json({ query: raw, rows: [], truncated: false });
  }

  const contains = { contains: raw, mode: "insensitive" };
  const wanted = only ? [only] : Object.keys(KINDS);
  const filtering = raw.length >= 2;
  const search = filtering ? contains : null;

  try {
    const results = await Promise.all(
      wanted.map(async (kind) => {
        const take = PER_KIND;
        switch (kind) {
          case "member": {
            const rows = await prisma.user.findMany({
              where: filtering
                ? { OR: [{ name: search }, { email: search }, { username: search }] }
                : {},
              select: { id: true, name: true, email: true, role: true, createdAt: true },
              orderBy: { createdAt: "desc" },
              take,
            });
            return rows.map((r) => ({
              kind,
              id: r.id,
              title: r.name || "(no name)",
              subtitle: r.email || "",
              status: r.role || "member",
              href: KINDS.member.href(r),
              updatedAt: iso(r.createdAt),
            }));
          }
          case "post": {
            const rows = await prisma.post.findMany({
              where: filtering ? { text: search } : {},
              select: { id: true, text: true, authorName: true, createdAt: true },
              orderBy: { createdAt: "desc" },
              take,
            });
            return rows.map((r) => ({
              kind,
              id: r.id,
              title: excerpt(r.text),
              subtitle: r.authorName || "",
              status: "published",
              href: KINDS.post.href(r),
              updatedAt: iso(r.createdAt),
            }));
          }
          case "article": {
            const rows = await prisma.article.findMany({
              where: filtering ? { OR: [{ title: search }, { content: search }] } : {},
              select: { id: true, title: true, authorName: true, createdAt: true },
              orderBy: { createdAt: "desc" },
              take,
            });
            return rows.map((r) => ({
              kind,
              id: r.id,
              title: r.title,
              subtitle: r.authorName || "",
              status: "published",
              href: KINDS.article.href(r),
              updatedAt: iso(r.createdAt),
            }));
          }
          case "room": {
            const rows = await prisma.room.findMany({
              where: filtering ? { name: search } : {},
              select: { id: true, name: true, slug: true, status: true, createdAt: true },
              orderBy: { createdAt: "desc" },
              take,
            });
            return rows.map((r) => ({
              kind,
              id: r.id,
              title: r.name,
              subtitle: r.slug,
              status: r.status || "active",
              href: KINDS.room.href(r),
              updatedAt: iso(r.createdAt),
            }));
          }
          case "space": {
            const rows = await prisma.space.findMany({
              where: filtering ? { name: search } : {},
              select: { id: true, name: true, slug: true, status: true, createdAt: true },
              orderBy: { createdAt: "desc" },
              take,
            });
            return rows.map((r) => ({
              kind,
              id: r.id,
              title: r.name,
              subtitle: r.slug,
              status: r.status || "active",
              href: KINDS.space.href(r),
              updatedAt: iso(r.createdAt),
            }));
          }
          case "group": {
            const rows = await prisma.group.findMany({
              where: filtering ? { name: search } : {},
              select: { id: true, name: true, slug: true, status: true, createdAt: true },
              orderBy: { createdAt: "desc" },
              take,
            });
            return rows.map((r) => ({
              kind,
              id: r.id,
              title: r.name,
              subtitle: r.slug,
              status: r.status || "active",
              href: KINDS.group.href(r),
              updatedAt: iso(r.createdAt),
            }));
          }
          case "event": {
            const rows = await prisma.event.findMany({
              where: filtering ? { title: search } : {},
              select: { id: true, title: true, startTime: true, createdAt: true },
              orderBy: { startTime: "desc" },
              take,
            });
            return rows.map((r) => ({
              kind,
              id: r.id,
              title: r.title,
              subtitle: "",
              status: new Date(r.startTime) > new Date() ? "upcoming" : "past",
              href: KINDS.event.href(r),
              updatedAt: iso(r.startTime),
            }));
          }
          case "course": {
            const rows = await prisma.course.findMany({
              where: filtering ? { title: search } : {},
              select: { id: true, title: true, status: true, createdAt: true },
              orderBy: { createdAt: "desc" },
              take,
            });
            return rows.map((r) => ({
              kind,
              id: r.id,
              title: r.title,
              subtitle: "",
              status: r.status || "draft",
              href: KINDS.course.href(r),
              updatedAt: iso(r.createdAt),
            }));
          }
          case "recording": {
            const rows = await prisma.recording.findMany({
              where: filtering ? { OR: [{ title: search }, { roomName: search }] } : {},
              select: { id: true, title: true, roomName: true, status: true, createdAt: true },
              orderBy: { createdAt: "desc" },
              take,
            });
            return rows.map((r) => ({
              kind,
              id: r.id,
              title: r.title || r.roomName || "(untitled)",
              subtitle: r.roomName || "",
              status: r.status,
              href: KINDS.recording.href(r),
              updatedAt: iso(r.createdAt),
            }));
          }
          default:
            return [];
        }
      })
    );

    const rows = results.flat().sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

    return NextResponse.json({
      query: raw,
      kinds: Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.label])),
      rows,
      truncated: rows.length >= PER_KIND * wanted.length,
    });
  } catch (err) {
    logError("admin.content.query_failed", { error: err.message });
    return NextResponse.json({ error: "Could not load content" }, { status: 500 });
  }
}
