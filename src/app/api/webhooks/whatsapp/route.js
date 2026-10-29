import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { addMessage } from "@/lib/server/chat";
import { createNotification } from "@/lib/server/notifications";
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

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return /^\d{8,15}$/.test(digits) ? digits : "";
}

function messageText(message) {
  if (message?.type === "text") return String(message.text?.body || "").trim().slice(0, 4096);
  if (message?.type === "button") return String(message.button?.text || message.button?.payload || "Button response").slice(0, 4096);
  if (message?.type === "interactive") {
    const item = message.interactive?.button_reply || message.interactive?.list_reply;
    return String(item?.title || item?.description || item?.id || "Interactive response").slice(0, 4096);
  }
  if (message?.type === "image") return String(message.image?.caption || "[Image received]").slice(0, 4096);
  if (message?.type === "audio" || message?.type === "voice") return "[Voice message received]";
  if (message?.type === "video") return String(message.video?.caption || "[Video received]").slice(0, 4096);
  if (message?.type === "document") return String(message.document?.caption || `[Document: ${message.document?.filename || "file"}]`).slice(0, 4096);
  if (message?.type === "location") return `[Location: ${message.location?.latitude ?? ""}, ${message.location?.longitude ?? ""}]`;
  return `[${String(message?.type || "unsupported")} message received]`;
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
        const value = change?.value || {};

        // Delivery/read/failure receipts update the outbound inbox record.
        for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
          if (!status?.id || !status?.status) continue;
          await prisma.whatsAppMessage.updateMany({
            where: { providerMessageId: String(status.id) },
            data: {
              status: String(status.status).slice(0, 40),
              metadata: {
                webhookStatus: status.status,
                errors: Array.isArray(status.errors) ? status.errors.map((item) => ({
                  code: item.code,
                  title: item.title,
                  message: item.message,
                })) : [],
                timestamp: status.timestamp || null,
              },
            },
          });
          console.log(JSON.stringify({ event: "whatsapp.delivery_status", status: status.status, messageId: status.id }));
        }

        const contacts = new Map(
          (Array.isArray(value.contacts) ? value.contacts : []).map((contact) => [
            normalizePhone(contact?.wa_id),
            String(contact?.profile?.name || "").slice(0, 120),
          ])
        );

        for (const message of Array.isArray(value.messages) ? value.messages : []) {
          const from = normalizePhone(message?.from);
          const providerMessageId = String(message?.id || "");
          if (!from || !providerMessageId) continue;

          const text = messageText(message);
          const contactName = contacts.get(from) || null;
          const linked = await prisma.socialLink.findFirst({
            where: {
              provider: "whatsapp",
              enabled: true,
              OR: [{ waId: from }, { phoneE164: `+${from}` }],
            },
            select: { userId: true, phoneE164: true },
          });

          let record = await prisma.whatsAppMessage.findUnique({
            where: { providerMessageId },
          }).catch(() => null);

          if (!record) {
            record = await prisma.whatsAppMessage.create({
              data: {
                providerMessageId,
                userId: linked?.userId || null,
                direction: "inbound",
                fromPhone: `+${from}`,
                toPhone: value?.metadata?.display_phone_number || null,
                contactName,
                text,
                messageType: String(message?.type || "unknown").slice(0, 40),
                status: "received",
                replyToMessageId: message?.context?.id || null,
                metadata: { contextId: message?.context?.id || null, chatSynced: false },
              },
            });
          }

          // If this was sent as a WhatsApp reply to a DM notification, mirror it
          // into that exact website conversation as the linked member.
          const contextId = String(message?.context?.id || record.replyToMessageId || "");
          if (contextId && linked?.userId && record.metadata?.chatSynced !== true) {
            const original = await prisma.whatsAppMessage.findUnique({
              where: { providerMessageId: contextId },
            });
            const conversationId = original?.conversationId;
            if (original?.direction === "outbound" && original.userId === linked.userId && conversationId) {
              const conversation = await prisma.conversation.findUnique({
                where: { id: conversationId },
                select: { type: true, participantIds: true },
              });
              if (conversation?.type === "dm" && (conversation.participantIds || []).includes(linked.userId)) {
                const sender = await prisma.user.findUnique({
                  where: { id: linked.userId },
                  select: { id: true, name: true, suspended: true },
                });
                if (sender && !sender.suspended) {
                  const created = await addMessage(conversationId, {
                    uid: sender.id,
                    name: sender.name || contactName || "Member",
                  }, text);
                  if (!created) {
                    throw new Error("whatsapp_dm_reply_sync_failed");
                  }
                  await prisma.whatsAppMessage.update({
                    where: { id: record.id },
                    data: {
                      conversationId,
                      metadata: { ...(record.metadata || {}), contextId, chatSynced: true },
                    },
                  });
                  const otherParticipantId = (conversation.participantIds || []).find((id) => id !== linked.userId);
                  if (otherParticipantId) {
                    await createNotification({
                      userId: otherParticipantId,
                      type: "dm",
                      actorId: linked.userId,
                      actorName: sender.name || contactName || "Member",
                      href: `/chat/${conversationId}`,
                      text: text.slice(0, 180),
                    }).catch((notifyError) => {
                      logError("whatsapp.dm_reply_notification_failed", { error: notifyError?.message });
                    });
                  }
                  console.log(JSON.stringify({ event: "whatsapp_dm_reply_synced", conversationId, messageId: providerMessageId }));
                }
              }
            }
          }

          if (linked?.userId) {
            await prisma.socialLink.updateMany({
              where: { userId: linked.userId, provider: "whatsapp" },
              data: { waId: from, lastMessageAt: new Date() },
            });
          }
        }
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    logError("whatsapp.webhook_processing_failed", { error: error?.message });
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
