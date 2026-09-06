import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc, canModerate } from "@/lib/server/auth";
import { getAccessSub, isActiveSub } from "@/lib/server/subscription";
import { getCapabilities, canWriteChat } from "@/lib/server/capabilities";
import { addMessage, getConversation } from "@/lib/server/chat";
import { createNotification } from "@/lib/server/notifications";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { sendEmail } from "@/lib/server/email";
import { logError } from "@/lib/server/log";
import { validateReplyText } from "@/lib/server/chat-core";

const MAX_ATTACHMENT_LENGTH = 700_000;
const IMAGE_MIME = /^image\/(png|jpe?g|gif|webp|avif)$/;
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

function validateAttachment(attachment) {
  if (!attachment || typeof attachment !== "object") {
    return { error: "Invalid attachment" };
  }
  const { dataUrl, mime, kind, name } = attachment;
  if (typeof dataUrl !== "string" || !dataUrl) {
    return { error: "Invalid attachment" };
  }
  if (dataUrl.length > MAX_ATTACHMENT_LENGTH) {
    return {
      error: "Attachment too large (max ~500 KB). Compress the file and try again.",
    };
  }
  if (typeof name !== "string" || !name.trim()) {
    return { error: "Attachment name required" };
  }
  const cleanMime = typeof mime === "string" ? mime.toLowerCase().trim() : "";
  const isImage = kind === "image";
  if (isImage) {
    if (!IMAGE_MIME.test(cleanMime)) {
      return { error: "Only PNG, JPEG, GIF, WEBP or AVIF images are allowed" };
    }
  } else if (kind !== "file" || !ALLOWED_FILE_MIME.has(cleanMime)) {
    return { error: "That file type isn't allowed yet" };
  }
  // The payload must actually match the declared type — blocks MIME smuggling
  // and non-data payloads (e.g. javascript: URLs).
  if (!dataUrl.startsWith(`data:${cleanMime};base64,`)) {
    return { error: "Attachment payload doesn't match its file type" };
  }
  return {
    ok: true,
    attachment: {
      name: name.slice(0, 120),
      mime: cleanMime.slice(0, 100),
      kind: isImage ? "image" : "file",
      size: Number.isFinite(attachment.size) && attachment.size > 0
        ? Math.round(Math.min(attachment.size, 50 * 1024 * 1024))
        : 0,
      dataUrl,
    },
  };
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
  const { listMessages } = await import("@/lib/server/chat");
  const allMessages = await listMessages(conversationId);

  const topLevel = [];
  const replyMap = {};

  for (const msg of allMessages) {
    if (msg.parentId) {
      if (!replyMap[msg.parentId]) replyMap[msg.parentId] = [];
      replyMap[msg.parentId].push(msg);
    }
  }

  for (const msg of allMessages) {
    if (!msg.parentId) {
      topLevel.push({
        ...msg,
        replies: replyMap[msg.id] || [],
        replyCount: replyMap[msg.id]?.length || msg.replyCount || 0,
      });
    }
  }

  return NextResponse.json({ messages: topLevel });
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
    const parentSnap = await adminDb()
      .collection("conversations")
      .doc(conversationId)
      .collection("messages")
      .doc(parentId)
      .get();
    if (!parentSnap.exists) {
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
    const parentRef = adminDb()
      .collection("conversations")
      .doc(conversationId)
      .collection("messages")
      .doc(parentId);
    await parentRef.update({
      replyCount: FieldValue.increment(1),
    }).catch(() => {});
  }

  const conv = await getConversation(conversationId, user.uid);
  if (conv && conv.type === "dm") {
    const otherId = (conv.participantIds || []).find((id) => id !== user.uid);
    if (otherId) {
      const otherSnap = await adminDb().collection("users").doc(otherId).get();
      if (otherSnap.exists) {
        const other = otherSnap.data();
        if (other.notifications !== "off") {
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
  }

  return NextResponse.json({ id: messageId });
}
