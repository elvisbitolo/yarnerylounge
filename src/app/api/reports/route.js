import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getAccessSub, isActiveSub } from "@/lib/server/subscription";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const sub = await getAccessSub(user.uid);
  if (!isActiveSub(sub)) {
    return NextResponse.json({ error: "Active membership required" }, { status: 403 });
  }
  const limited = rateLimitGuard(`report:${user.uid}`, { limit: 20 });
  if (limited) return limited;

  const { type, targetId, commentPostId = "", reason } = await req.json();
  if (!["post", "comment", "member"].includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  if (!targetId) {
    return NextResponse.json({ error: "Target required" }, { status: 400 });
  }
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    return NextResponse.json({ error: "Reason required" }, { status: 400 });
  }
  if (reason.trim().length > 500) {
    return NextResponse.json({ error: "Reason too long" }, { status: 400 });
  }

  const userDoc = await getUserDoc(user.uid);
  const targetPath =
    type === "post"
      ? `posts/${targetId}`
      : type === "comment"
        ? `posts/${commentPostId}/comments/${targetId}`
        : "";

  const prisma = getPrisma();
  try {
    const created = await prisma.report.create({
      data: {
        type,
        targetId,
        commentPostId: type === "comment" ? commentPostId : "",
        targetPath,
        reporterId: user.uid,
        reporterName: userDoc?.name || user.name || user.email?.split("@")[0] || "Member",
        reason: reason.trim(),
        status: "open",
        createdAt: new Date(),
      },
    });
    return NextResponse.json({ id: created.id });
  } catch (err) {
    logError("reports.create_prisma_failed", { error: err.message });
    return NextResponse.json({ error: "Could not submit report" }, { status: 500 });
  }
}