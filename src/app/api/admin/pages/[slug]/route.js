// Moderator-only public page editor. Drafts are saved here and only become
// public through the explicit publish action; the public route never reads a
// draft. Authorization is server-side via requireModerator() (the same guard as
// the rest of /admin), so a crafted request cannot bypass the editor screen.

import { NextResponse } from "next/server";
import { requireModerator, guardJson } from "@/lib/server/authorize";
import { getAdminPage, publishPage, savePageDraft } from "@/lib/server/site-pages";

export const dynamic = "force-dynamic";

function denied(result) {
  return NextResponse.json({ error: result.error }, { status: result.status });
}

export async function GET(req, { params }) {
  const auth = await requireModerator();
  const gate = guardJson(auth);
  if (gate) return gate;

  const { slug } = await params;
  try {
    const result = await getAdminPage(slug);
    if (!result.ok) return denied(result);
    return NextResponse.json(result.page);
  } catch {
    return NextResponse.json({ error: "Could not load saved pages" }, { status: 503 });
  }
}

export async function PUT(req, { params }) {
  const auth = await requireModerator();
  const gate = guardJson(auth);
  if (gate) return gate;

  const { slug } = await params;
  const body = await req.json().catch(() => null);
  try {
    const result = await savePageDraft({
      slug,
      blocks: body?.blocks,
      actor: { ...auth.user, ...auth.userDoc },
    });
    if (!result.ok) return denied(result);
    return NextResponse.json(result.page);
  } catch {
    return NextResponse.json({ error: "Could not save the page" }, { status: 503 });
  }
}

export async function POST(req, { params }) {
  const auth = await requireModerator();
  const gate = guardJson(auth);
  if (gate) return gate;

  const { slug } = await params;
  const body = await req.json().catch(() => null);
  if (body?.action !== "publish") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  try {
    const result = await publishPage({ slug, actor: { ...auth.user, ...auth.userDoc } });
    if (!result.ok) return denied(result);
    return NextResponse.json(result.page);
  } catch {
    return NextResponse.json({ error: "Could not publish the page" }, { status: 503 });
  }
}
