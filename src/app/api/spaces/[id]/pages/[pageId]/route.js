import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { canManageScope } from "@/lib/server/hosts";
import { getSpace, isSpaceMember } from "@/lib/server/spaces";
import { getPage, updatePage, deletePage } from "@/lib/server/pages";
import {
  validatePageTitle,
  validatePageContent,
  validatePageSlug,
  validateVisibility,
} from "@/lib/server/pages-core";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function GET(req, { params }) {
  const { id: spaceId, pageId } = await params;
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const space = await getSpace(spaceId);
  if (!space || space.status !== "active") {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  const page = await getPage(pageId);
  if (!page || page.spaceId !== spaceId) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
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

  if (page.visibility === "members" && !isMember && !isOwner) {
    return NextResponse.json({ error: "Membership required" }, { status: 403 });
  }

  return NextResponse.json({ page });
}

export async function PUT(req, { params }) {
  const { id: spaceId, pageId } = await params;
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const space = await getSpace(spaceId);
  if (!space || space.status !== "active") {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  const isOwner = auth.userDoc?.role === "owner";
  const isManager = await canManageScope(auth.user.uid, "space", spaceId);
  if (!isOwner && !isManager) {
    return NextResponse.json({ error: "Host access required for this space" }, { status: 403 });
  }

  const page = await getPage(pageId);
  if (!page || page.spaceId !== spaceId) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const body = await req.json();
  const patch = {};

  if (body.title !== undefined) {
    const title = validatePageTitle(body.title);
    if (!title.ok) return NextResponse.json({ error: title.error }, { status: 400 });
    patch.title = title.title;
  }
  if (body.content !== undefined) {
    const content = validatePageContent(body.content);
    if (!content.ok) return NextResponse.json({ error: content.error }, { status: 400 });
    patch.content = content.content;
  }
  if (body.slug !== undefined) {
    const slug = validatePageSlug(body.slug);
    if (!slug.ok) return NextResponse.json({ error: slug.error }, { status: 400 });
    if (slug.slug !== page.slug && (await slugTakenElsewhere(spaceId, pageId, slug.slug))) {
      return NextResponse.json({ error: "A page with that slug already exists" }, { status: 409 });
    }
    patch.slug = slug.slug;
  }
  if (body.position !== undefined) patch.position = Number(body.position) || 0;
  if (body.visibility !== undefined) patch.visibility = validateVisibility(body.visibility);

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await updatePage(pageId, patch);
  return NextResponse.json({ page: updated });
}

export async function DELETE(req, { params }) {
  const { id: spaceId, pageId } = await params;
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const space = await getSpace(spaceId);
  if (!space || space.status !== "active") {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  const isOwner = auth.userDoc?.role === "owner";
  const isManager = await canManageScope(auth.user.uid, "space", spaceId);
  if (!isOwner && !isManager) {
    return NextResponse.json({ error: "Host access required for this space" }, { status: 403 });
  }

  const page = await getPage(pageId);
  if (!page || page.spaceId !== spaceId) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  await deletePage(pageId);
  return NextResponse.json({ ok: true });
}

async function slugTakenElsewhere(spaceId, pageId, slug) {
  try {
    const page = await getPrisma().spacePage.findUnique({
      where: { spaceId_slug: { spaceId, slug } },
      select: { id: true },
    });
    return !!page && page.id !== pageId;
  } catch (err) {
    logError("pages.slug_lookup_failed", { error: err.message, spaceId, slug });
    return false;
  }
}
