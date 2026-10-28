import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { requireActiveMember } from "@/lib/server/authorize";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const auth = await requireActiveMember();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const enabled = body?.enabled !== false;
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ ok: true });

  try {
    const existing = await prisma.socialLink.findFirst({ where: { userId: auth.user.uid, provider: "whatsapp" } });
    if (!existing) return NextResponse.json({ error: "Not linked" }, { status: 404 });
    await prisma.socialLink.update({ where: { id: existing.id }, data: { enabled } });
    return NextResponse.json({ ok: true, enabled });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
  }
}
