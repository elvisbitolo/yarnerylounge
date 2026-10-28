import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
      return new NextResponse(challenge, { status: 200 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } catch (error) {
    return NextResponse.json({ error: "error" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const prisma = getPrisma();
    if (!prisma) return NextResponse.json({ ok: true });

    // Track 24h window when user messages us
    const entries = body?.entry || [];
    for (const entry of entries) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        const value = change?.value || {};
        const messages = value?.messages || [];
        for (const msg of messages) {
          const from = msg?.from; // wa_id/phone
          if (!from) continue;
          try {
            await prisma.socialLink.updateMany({
              where: { provider: "whatsapp", waId: from },
              data: { lastMessageAt: new Date() },
            });
            // also try matching by phone without +
            const digits = String(from).replace(/\D/g, "");
            if (digits) {
              await prisma.socialLink.updateMany({
                where: { provider: "whatsapp", phoneE164: { contains: digits } },
                data: { lastMessageAt: new Date() },
              });
            }
          } catch {
            /* best effort */
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: true });
  }
}
