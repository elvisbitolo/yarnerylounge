import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc, canModerate } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { sendWhatsAppText } from "@/lib/server/social/whatsapp";
import { logError } from "@/lib/server/log";
import { rateLimitGuard } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

async function requireWhatsAppAdmin() {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const doc = await getUserDoc(user.uid);
  if (!canModerate(doc)) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user, doc };
}

function cleanPhone(value) {
  let phone = String(value || "").trim().replace(/[\s().-]/g, "");
  if (!phone.startsWith("+") && /^\d{8,15}$/.test(phone)) phone = `+${phone}`;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : "";
}

export async function GET() {
  const auth = await requireWhatsAppAdmin();
  if (auth.response) return auth.response;
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  try {
    const rows = await prisma.whatsAppMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { user: { select: { id: true, name: true, email: true, photoURL: true } } },
    });
    const contacts = new Map();
    for (const row of rows) {
      const phone = row.direction === "inbound" ? row.fromPhone : (row.toPhone || row.fromPhone);
      if (!phone) continue;
      if (!contacts.has(phone)) {
        contacts.set(phone, {
          phone,
          userId: row.userId || null,
          name: row.contactName || row.user?.name || row.user?.email?.split("@")[0] || phone,
          photoURL: row.user?.photoURL || "",
          messages: [],
          lastMessageAt: row.createdAt,
          lastMessage: row.text,
        });
      }
      const contact = contacts.get(phone);
      if (!contact.userId && row.userId) contact.userId = row.userId;
      if ((!contact.name || contact.name === phone) && (row.contactName || row.user?.name)) {
        contact.name = row.contactName || row.user.name;
      }
      if (contact.messages.length < 100) {
        contact.messages.push({
          id: row.id,
          providerMessageId: row.providerMessageId,
          direction: row.direction,
          text: row.text,
          status: row.status,
          messageType: row.messageType,
          createdAt: row.createdAt,
          conversationId: row.conversationId,
          userId: row.userId,
        });
      }
    }
    return NextResponse.json({ ok: true, contacts: [...contacts.values()] });
  } catch (error) {
    logError("whatsapp.inbox_load_failed", { error: error?.message });
    return NextResponse.json({ error: "Unable to load WhatsApp inbox" }, { status: 500 });
  }
}

export async function POST(req) {
  const auth = await requireWhatsAppAdmin();
  if (auth.response) return auth.response;
  const limited = rateLimitGuard(`whatsapp-inbox:${auth.user.uid}`, { limit: 30 });
  if (limited) return limited;
  const body = await req.json().catch(() => ({}));
  const phoneE164 = cleanPhone(body?.phone);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!phoneE164) return NextResponse.json({ error: "Enter a valid international WhatsApp number." }, { status: 400 });
  if (!text || text.length > 4096) return NextResponse.json({ error: "Message must contain 1–4096 characters." }, { status: 400 });

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  try {
    const link = await prisma.socialLink.findFirst({
      where: { provider: "whatsapp", OR: [{ phoneE164 }, { waId: phoneE164.replace(/^\+/, "") }] },
      select: { userId: true, phoneE164: true },
    });
    const result = await sendWhatsAppText({
      to: phoneE164.replace(/^\+/, ""),
      body: text,
    });
    const providerMessageId = result?.messages?.[0]?.id || null;
    const row = await prisma.whatsAppMessage.create({
      data: {
        providerMessageId,
        userId: link?.userId || null,
        direction: "outbound",
        fromPhone: process.env.WHATSAPP_PHONE_NUMBER_ID || "business",
        toPhone: phoneE164,
        text,
        messageType: "text",
        status: "sent",
        metadata: { source: "admin_whatsapp_inbox", sentBy: auth.user.uid },
      },
    });
    return NextResponse.json({ ok: true, message: { id: row.id, providerMessageId, status: row.status } });
  } catch (error) {
    logError("whatsapp.inbox_send_failed", { error: error?.message });
    const message = String(error?.message || "");
    const status = /whatsapp_not_configured/.test(message) ? 503 : 502;
    return NextResponse.json({
      error: status === 503
        ? "WhatsApp Cloud API is not configured."
        : `WhatsApp could not send this message. ${message.slice(0, 220)}`,
    }, { status });
  }
}
