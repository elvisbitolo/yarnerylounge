import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { revokeApiToken } from "@/lib/server/api-tokens";

export const dynamic = "force-dynamic";

export async function DELETE(req, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const revoked = await revokeApiToken(user.uid, id);
  if (!revoked) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
