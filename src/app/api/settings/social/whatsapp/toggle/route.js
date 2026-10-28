import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { requireActiveMember } from "@/lib/server/authorize";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const auth = await requireActiveMember();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
  }

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  try {
    const existing = await prisma.socialLink.findFirst({
      where: { userId: auth.user.uid, provider: "whatsapp" },
    });
    if (!existing) return NextResponse.json({ error: "WhatsApp is not linked" }, { status: 404 });
    await prisma.socialLink.update({ where: { id: existing.id }, data: { enabled: body.enabled } });
    return NextResponse.json({ ok: true, enabled: body.enabled });
  } catch {
    return NextResponse.json({ error: "Unable to update WhatsApp settings" }, { status: 500 });
  }
}
