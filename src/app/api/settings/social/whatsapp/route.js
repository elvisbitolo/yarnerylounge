import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { requireActiveMember } from "@/lib/server/authorize";

export const dynamic = "force-dynamic";

function normalizeE164(input) {
  if (!input) return null;
  let value = String(input).trim().replace(/[\s().-]/g, "");
  if (!value.startsWith("+")) {
    if (/^\d{8,15}$/.test(value)) value = `+${value}`;
    else return null;
  }
  return /^\+[1-9]\d{7,14}$/.test(value) ? value : null;
}

export async function GET() {
  const auth = await requireActiveMember();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  try {
    const link = await prisma.socialLink.findUnique({
      where: { userId_provider: { userId: auth.user.uid, provider: "whatsapp" } },
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
  } catch {
    return NextResponse.json({ error: "Unable to load linked account" }, { status: 500 });
  }
}

export async function POST(req) {
  const auth = await requireActiveMember();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const phoneE164 = normalizeE164(body?.phone);
  if (!phoneE164) {
    return NextResponse.json({ error: "Enter a valid phone number in international format, e.g. +254..." }, { status: 400 });
  }
  if (body?.consent !== true) {
    return NextResponse.json({ error: "Please confirm that you consent to receiving WhatsApp notifications." }, { status: 400 });
  }

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  try {
    const existing = await prisma.socialLink.findUnique({
      where: { userId_provider: { userId: auth.user.uid, provider: "whatsapp" } },
    }).catch(() => null);
    const link = await prisma.socialLink.upsert({
      where: { userId_provider: { userId: auth.user.uid, provider: "whatsapp" } },
      create: {
        userId: auth.user.uid,
        provider: "whatsapp",
        phoneE164,
        enabled: true,
        consentAt: new Date(),
        lastMessageAt: new Date(),
        verifiedAt: new Date(),
      },
      update: {
        phoneE164,
        enabled: true,
        consentAt: new Date(),
        lastMessageAt: new Date(),
        verifiedAt: existing?.verifiedAt || new Date(),
        waId: null,
      },
    });
    return NextResponse.json({
      ok: true,
      link: { phoneE164: link.phoneE164, enabled: link.enabled, verifiedAt: link.verifiedAt },
    });
  } catch (error) {
    // Keep database details in server logs, never expose them to the browser.
    console.error("[whatsapp-link] Failed to save SocialLink", {
      name: error instanceof Error ? error.name : "UnknownError",
      code: error && typeof error === "object" && "code" in error ? error.code : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
    try {
      const existing = await prisma.socialLink.findFirst({ where: { userId: auth.user.uid, provider: "whatsapp" } });
      if (existing) {
        const link = await prisma.socialLink.update({ where: { id: existing.id }, data: { phoneE164, enabled: true, consentAt: new Date(), lastMessageAt: new Date(), verifiedAt: existing.verifiedAt || new Date(), waId: null } });
        return NextResponse.json({ ok: true, link: { phoneE164: link.phoneE164, enabled: link.enabled, verifiedAt: link.verifiedAt } });
      }
      const link = await prisma.socialLink.create({ data: { userId: auth.user.uid, provider: "whatsapp", phoneE164, enabled: true, consentAt: new Date(), lastMessageAt: new Date(), verifiedAt: new Date() } });
      return NextResponse.json({ ok: true, link: { phoneE164: link.phoneE164, enabled: link.enabled, verifiedAt: link.verifiedAt } });
    } catch (e2) {
      return NextResponse.json({ error: "Unable to save WhatsApp link. Please try again later." }, { status: 500 });
    }
  }
}

export async function DELETE() {
  const auth = await requireActiveMember();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  try {
    await prisma.socialLink.deleteMany({ where: { userId: auth.user.uid, provider: "whatsapp" } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to unlink WhatsApp" }, { status: 500 });
  }
}
