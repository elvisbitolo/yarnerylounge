import { NextResponse } from "next/server";
import { requireModerator, guardJson } from "@/lib/server/authorize";
import { isEditableKind, updateContent } from "@/lib/server/admin-content";

export async function PATCH(req, { params }) {
  const { kind, id } = await params;

  const auth = await requireModerator();
  const denied = guardJson(auth);
  if (denied) return denied;

  if (!isEditableKind(kind)) {
    return NextResponse.json({ error: "That content type is not editable" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const result = await updateContent(kind, id, body, { ...auth.user, ...auth.userDoc });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, changed: result.changed });
}
