import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export const dynamic = "force-dynamic";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "";

function isValidSignature(rawBody, signature) {
  const appSecret = process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET;
  if (!appSecret || !signature) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");
    if (VERIFY_TOKEN && mode === "subscribe" && token === VERIFY_TOKEN && challenge !== null) {
      return new NextResponse(challenge, { status: 200 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "Invalid verification request" }, { status: 400 });
  }
}

export async function POST(req) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (!isValidSignature(rawBody, signature)) {
    if (!process.env.WHATSAPP_APP_SECRET && !process.env.META_APP_SECRET) {
      logError("whatsapp.webhook_secret_missing", {});
      return NextResponse.json({ error: "Webhook signature verification is not configured" }, { status: 503 });
    }
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  try {
    for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
      for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
        const messages = Array.isArray(change?.value?.messages) ? change.value.messages : [];
        for (const message of messages) {
          const from = String(message?.from || "").replace(/\D/g, "");
          if (!/^\d{8,15}$/.test(from)) continue;
          await prisma.socialLink.updateMany({
            where: {
              provider: "whatsapp",
              OR: [{ waId: from }, { phoneE164: `+${from}` }],
            },
            data: { waId: from, lastMessageAt: new Date() },
          });
        }

        // Delivery receipts are separate from inbound messages. Log their
        // status so API acceptance is not mistaken for delivery or read.
        const statuses = Array.isArray(change?.value?.statuses) ? change.value.statuses : [];
        for (const status of statuses) {
          const errors = Array.isArray(status?.errors)
            ? status.errors.map((item) => ({ code: item?.code, title: item?.title })).filter((item) => item.code || item.title)
            : [];
          console.log(JSON.stringify({
            event: "whatsapp_delivery_status",
            messageId: status?.id || null,
            status: status?.status || "unknown",
            timestamp: status?.timestamp || null,
            errors,
          }));
        }
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    logError("whatsapp.webhook_processing_failed", { error: error?.message });
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
