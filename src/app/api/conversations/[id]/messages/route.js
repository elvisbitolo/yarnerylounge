import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc, canModerate } from "@/lib/server/auth";
import { getAccessSub, isActiveSub } from "@/lib/server/subscription";
import { getCapabilities, canWriteChat } from "@/lib/server/capabilities";
import { getConversation, addMessage } from "@/lib/server/chat";
import { createNotification } from "@/lib/server/notifications";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getPrisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/server/email";
import { logError } from "@/lib/server/log";
import { validateReplyText } from "@/lib/server/chat-core";

const MAX_ATTACHMENT_LENGTH = 700_000;
const IMAGE_MIME = /^image\/(png|jpe?g|gif|webp|avif)$/;
const VOICE_MIME = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"]);
const MAX_VOICE_PEAKS = 64;
const ALLOWED_FILE_MIME = new Set([
  "application/octet-stream",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
]);
// Shared recordings travel as an app-relative deep link, never a data payload.
const RECORDING_LINK = /^\/recordings\?rec=[A-Za-z0-9_-]+$/;

function validateAttachment(attachment) {
  if (!attachment || typeof attachment !== "object") {
    return { error: "Invalid attachment" };
  }
  const { dataUrl, mime, kind, name } = attachment;
  if (typeof dataUrl !== "string" || !dataUrl) {
    return { error: "Invalid attachment" };
  }
  // Large attachments are stored on Vercel Blob (uploads/chat/...) and the
  // message only carries the public URL — still encrypted at rest like any
  // other message field.
  const isBlobUrl = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i.test(dataUrl);
  if (!isBlobUrl && dataUrl.length > MAX_ATTACHMENT_LENGTH) {
    return {
      error: "Attachment too large (max ~500 KB). Compress the file and try again.",
    };
  }
  if (typeof name !== "string" || !name.trim()) {
    return { error: "Attachment name required" };
  }
  const cleanMime = typeof mime === "string" ? mime.toLowerCase().trim() : "";
  const baseMime = cleanMime.split(";")[0].trim();
  const isImage = kind === "image";
  const isAudio = kind === "audio";
  const isRecording = kind === "recording";
  if (isImage) {
    if (!IMAGE_MIME.test(cleanMime)) {
      return { error: "Only PNG, JPEG, GIF, WEBP or AVIF images are allowed" };
    }
  } else if (isAudio) {
    if (!VOICE_MIME.has(baseMime)) {
      return { error: "That audio format isn't supported" };
    }
  } else if (isRecording) {
    // A shared recording is an internal deep link, not an uploaded file.
    if (!RECORDING_LINK.test(dataUrl)) {
      return { error: "Invalid recording link" };
    }
  } else if (kind !== "file" || (!isBlobUrl && !ALLOWED_FILE_MIME.has(cleanMime))) {
    return { error: "That file type isn't allowed yet" };
  }
  // The payload must actually match the declared type — blocks MIME smuggling
  // and non-data payloads (e.g. javascript: URLs). Blob URLs are already
  // validated by the server-side upload route.
  if (!isRecording && !isBlobUrl && !dataUrl.startsWith(`data:${isAudio ? baseMime : cleanMime};base64,`)) {
    return { error: "Attachment payload doesn't match its file type" };
  }
  const attachmentOut = {
    name: name.slice(0, 120),
    mime: (isRecording ? "text/uri-list" : isAudio ? baseMime : cleanMime).slice(0, 100),
    kind: isImage ? "image" : isAudio ? "audio" : isRecording ? "recording" : "file",
    size: Number.isFinite(attachment.size) && attachment.size > 0
      ? Math.round(Math.min(attachment.size, 50 * 1024 * 1024))
      : 0,
    dataUrl,
  };
  if (isAudio) {
    attachmentOut.durationMs = Number.isFinite(attachment.durationMs) && attachment.durationMs > 0
      ? Math.round(Math.min(attachment.durationMs, 15 * 60 * 1000))
      : 0;
    if (Array.isArray(attachment.peaks)) {
      attachmentOut.peaks = attachment.peaks
        .slice(0, MAX_VOICE_PEAKS)
        .map((p) => {
          const n = Number(p);
          if (!Number.isFinite(n)) return 0;
          return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
        });
    }
  }
  return { ok: true, attachment: attachmentOut };
}

export async function GET(req, { params }) {
  const { id: conversationId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const sub = await getAccessSub(user.uid);
  if (!isActiveSub(sub)) {
    return NextResponse.json({ error: "Active membership required" }, { status: 403 });
  }
  const limited = rateLimitGuard(`conv-msgs:${user.uid}`, { limit: 240 });
  if (limited) return limited;
  const conv = await getConversation(conversationId, user.uid);
  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  const pathUrl = new URL(req.url);
  const beforeRaw = pathUrl.searchParams.get("before");
  const before = beforeRaw && Number(beforeRaw) > 0 ? Number(beforeRaw) : null;
  const { listMessagesBefore } = await import("@/lib/server/chat");
  const { messages, hasMore } = await listMessagesBefore(conversationId, before, 200);

  return NextResponse.json({ messages, hasMore: !!hasMore });
}

export async function POST(req, { params }) {
  const { id: conversationId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const sub = await getAccessSub(user.uid);
  if (!isActiveSub(sub)) {
    return NextResponse.json({ error: "Active membership required" }, { status: 403 });
  }
  const userDoc = await getUserDoc(user.uid);
  const caps = await getCapabilities(user.uid);
  if (!canWriteChat(caps) && !canModerate(userDoc)) {
    return NextResponse.json(
      { error: "Upgrade to chat with the group!" },
      { status: 403 }
    );
  }
  const limited = rateLimitGuard(`message:${user.uid}`, { limit: 30 });
  if (limited) return limited;

  const body = await req.json();
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const parentId = typeof body?.parentId === "string" && body.parentId ? body.parentId : null;
  let attachment = body?.attachment || null;

  if (parentId) {
    try {
      const prisma = getPrisma();
      if (!prisma) {
        return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
      }
      const parent = await prisma.conversationMessage.findUnique({
        where: { id: parentId },
        select: { conversationId: true },
      });
      if (!parent || parent.conversationId !== conversationId) {
        return NextResponse.json({ error: "Parent message not found" }, { status: 404 });
      }
    } catch (err) {
      logError("chat.prisma_parent_read_failed", { error: err.message });
      return NextResponse.json({ error: "Parent message not found" }, { status: 404 });
    }
  }

  if (text.length > 2000) {
    return NextResponse.json({ error: "Message too long" }, { status: 400 });
  }

  if (attachment) {
    const checked = validateAttachment(attachment);
    if (!checked.ok) {
      return NextResponse.json({ error: checked.error }, { status: 400 });
    }
    attachment = checked.attachment;
    if (!text && !attachment.dataUrl) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }
  } else if (!text) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  const senderName = userDoc?.name || user.name || user.email?.split("@")[0] || "Member";
  const messageId = await addMessage(
    conversationId,
    {
      uid: user.uid,
      name: senderName,
    },
    text,
    attachment,
    parentId
  );

  if (!messageId) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  if (parentId) {
    try {
      const prisma = getPrisma();
      if (prisma) {
        await prisma.conversationMessage.updateMany({
          where: { id: parentId, conversationId },
          data: { replyCount: { increment: 1 } },
        });
      }
    } catch (err) {
      logError("chat.prisma_reply_count_failed", { error: err.message });
    }
  }

  const conv = await getConversation(conversationId, user.uid);
  if (conv && conv.type === "dm") {
    const otherId = (conv.participantIds || []).find((id) => id !== user.uid);
    if (otherId) {
      let other = null;
      try {
        const prisma = getPrisma();
        if (prisma) {
          const row = await prisma.user.findUnique({
            where: { id: otherId },
            select: { email: true, notifications: true },
          });
          if (row) other = { email: row.email || "", notifications: row.notifications || "" };
        }
      } catch (err) {
        logError("chat.prisma_dm_recipient_failed", { error: err.message });
      }
      if (other && other.notifications !== "off") {
        const snippet = text || (attachment?.kind === "image" ? "📷 Photo" : `📎 ${attachment?.name || "File"}`);
        await createNotification({
          userId: otherId,
          type: "dm",
          actorId: user.uid,
          actorName: senderName,
          href: `/chat/${conversationId}`,
          text: snippet,
        }).catch((err) => {
          logError("notification.dm_failed", { conversationId, error: err.message });
        });
        if (other.email) {
          await sendEmail({
            to: other.email,
            subject: `New message from ${senderName}`,
            text:
              `${senderName} sent you a message:\n\n"${snippet}"\n\n` +
              `Reply in the community chat: ${process.env.NEXT_PUBLIC_APP_URL || ""}/chat/${conversationId}`,
          }).catch((err) => {
            logError("email.dm_notify_failed", { conversationId, error: err.message });
          });
        }
      }
    }
  }

  return NextResponse.json({ id: messageId });
}
