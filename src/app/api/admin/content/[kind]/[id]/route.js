import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { canManageScope } from "@/lib/server/hosts";
import { isEditableKind, updateContent } from "@/lib/server/admin-content";
import { evaluateContentPolicy } from "@/lib/admin/content-policy";

export const dynamic = "force-dynamic";

// Generic staff editor for database-backed text.
//
// This used to call requireModerator() and stop there, which granted every
// moderator write access to every record of every kind - broader than the
// screens around it. /admin/questions is wrapped in <RequireOwner>, and
// /api/events/[id] deliberately restricts edits with canManageScope(), so the
// generic route was a way around both. Authorization is now per kind; see
// lib/admin/content-policy.js.

export async function PATCH(req, { params }) {
  const { kind, id } = await params;

  // requireUser, not requireModerator: a scoped event host who is not staff
  // still has to be able to edit their own event copy. The policy below decides.
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  if (!isEditableKind(kind)) {
    return NextResponse.json({ error: "That content type is not editable" }, { status: 400 });
  }

  // Only the scope-scoped kind needs an extra authority lookup.
  let isHost = false;
  if (kind === "event") {
    isHost = await canManageScope(auth.user.uid, "event", id);
  }

  const verdict = evaluateContentPolicy({
    kind,
    role: auth.userDoc?.role,
    isHost,
  });
  if (!verdict.allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: verdict.status || 403 });
  }

  const body = await req.json().catch(() => null);
  const result = await updateContent(kind, id, body, { ...auth.user, ...auth.userDoc });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, changed: result.changed });
}