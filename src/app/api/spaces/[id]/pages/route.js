import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { canManageScope } from "@/lib/server/hosts";
import { getSpace, isSpaceMember } from "@/lib/server/spaces";
import { createPage, listPages } from "@/lib/server/pages";
import {
  validatePageTitle,
  validatePageContent,
  validatePageSlug,
  validateVisibility,
} from "@/lib/server/pages-core";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

function visiblePages(pages, isMember) {
  return pages.filter((page) => page.visibility === "all" || isMember);
}

export async function GET(req, { params }) {
  const { id: spaceId } = await params;
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const space = await getSpace(spaceId);
  if (!space || space.status !== "active") {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  const isOwner = auth.userDoc?.role === "owner";
  const membership = await isSpaceMember(spaceId, auth.user.uid);
  const isMember = !!membership;

  const allowedToView =
    isMember ||
    isOwner ||
    space.access === "public" ||
    (space.access !== "invite" && space.publicPreview);

  if (!allowedToView) {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  const pages = await listPages(spaceId);
  return NextResponse.json({ pages: visiblePages(pages, isMember) });
}

export async function POST(req, { params }) {
  const { id: spaceId } = await params;
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const limited = rateLimitGuard(`page:create:${auth.user.uid}`, { limit: 10 });
  if (limited) return limited;

  const space = await getSpace(spaceId);
  if (!space || space.status !== "active") {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  const isOwner = auth.userDoc?.role === "owner";
  const isManager = await canManageScope(auth.user.uid, "space", spaceId);
  if (!isOwner && !isManager) {
    return NextResponse.json({ error: "Host access required for this space" }, { status: 403 });
  }

  const body = await req.json();

  const title = validatePageTitle(body.title);
  if (!title.ok) return NextResponse.json({ error: title.error }, { status: 400 });

  const content = validatePageContent(body.content);
  if (!content.ok) return NextResponse.json({ error: content.error }, { status: 400 });

  const slug = validatePageSlug(body.slug || "");
  if (!slug.ok) return NextResponse.json({ error: slug.error }, { status: 400 });

  if (await pageSlugTaken(spaceId, slug.slug)) {
    return NextResponse.json({ error: "A page with that slug already exists" }, { status: 409 });
  }

  const page = await createPage({
    title: title.title,
    slug: slug.slug,
    content: content.content,
    spaceId,
    position: body.position ?? 0,
    visibility: validateVisibility(body.visibility),
    createdBy: auth.user.uid,
  });

  return NextResponse.json({ ok: true, page }, { status: 201 });
}

async function pageSlugTaken(spaceId, slug) {
  try {
    const page = await getPrisma().spacePage.findUnique({
      where: { spaceId_slug: { spaceId, slug } },
      select: { id: true },
    });
    return !!page;
  } catch (err) {
    logError("pages.slug_lookup_failed", { error: err.message, spaceId, slug });
    return false;
  }
}
