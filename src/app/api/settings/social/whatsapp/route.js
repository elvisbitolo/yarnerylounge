import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { requireActiveMember } from "@/lib/server/authorize";

export const dynamic = "force-dynamic";

function normalizeE164(input) {
  if (!input) return null;
  let s = String(input).trim().replace(/\s+/g, "");
  if (!s.startsWith("+")) {
    // try to be lenient - require + for now
    if (/^\d{9,15}$/.test(s)) s = "+" + s;
    else return null;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(s)) return null;
  return s;
}

export async function GET() {
  const auth = await requireActiveMember();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ ok: true, link: null });

  const link = await prisma.socialLink.findUnique({
    where: { userId_provider: { userId: auth.user.uid, provider: "whatsapp" } },
  }).catch(async () => {
    // fallback if composite unique not found by name
    return prisma.socialLink.findFirst({ where: { userId: auth.user.uid, provider: "whatsapp" } });
  });

  if (!link) return NextResponse.json({ ok: true, link: null });
  return NextResponse.json({
    ok: true,
    link: {
      id: link.id,
      provider: link.provider,
      phoneE164: link.phoneE164,
      enabled: link.enabled,
      verifiedAt: link.verifiedAt,
      createdAt: link.createdAt,
    },
  });
}

export async function POST(req) {
  const auth = await requireActiveMember();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const phoneE164 = normalizeE164(body?.phone);
  if (!phoneE164) {
    return NextResponse.json({ error: "Enter a valid phone number in E.164 format (e.g. +254...)" }, { status: 400 });
  }

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Unavailable" }, { status: 500 });

  try {
    const link = await prisma.socialLink.upsert({
      where: { userId_provider: { userId: auth.user.uid, provider: "whatsapp" } },
      create: {
        userId: auth.user.uid,
        provider: "whatsapp",
        phoneE164,
        enabled: true,
        consentAt: new Date(),
      },
      update: {
        phoneE164,
        enabled: true,
      },
    });
    return NextResponse.json({ ok: true, link: { phoneE164: link.phoneE164, enabled: link.enabled } });
  } catch (error) {
    // try create if upsert fails due to schema
    try {
      const existing = await prisma.socialLink.findFirst({ where: { userId: auth.user.uid, provider: "whatsapp" } });
      if (existing) {
        const link = await prisma.socialLink.update({ where: { id: existing.id }, data: { phoneE164, enabled: true } });
        return NextResponse.json({ ok: true, link: { phoneE164: link.phoneE164, enabled: link.enabled } });
      }
      const link = await prisma.socialLink.create({ data: { userId: auth.user.uid, provider: "whatsapp", phoneE164, enabled: true, consentAt: new Date() } });
      return NextResponse.json({ ok: true, link: { phoneE164: link.phoneE164, enabled: link.enabled } });
    } catch (e2) {
      return NextResponse.json({ error: e2?.message || "Failed" }, { status: 500 });
    }
  }
}

export async function DELETE() {
  const auth = await requireActiveMember();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ ok: true });

  try {
    await prisma.socialLink.deleteMany({ where: { userId: auth.user.uid, provider: "whatsapp" } });
  } catch {}
  return NextResponse.json({ ok: true });
}
