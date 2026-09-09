import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { getUserDoc } from "@/lib/server/auth";
import { logAudit } from "@/lib/server/audit";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

const STICKER_TYPES = {
  trophy: { emoji: "🏆", label: "Trophy" },
  star: { emoji: "⭐", label: "Star" },
  yarn: { emoji: "🧶", label: "Yarn Ball" },
  heart: { emoji: "❤️", label: "Heart" },
  celebration: { emoji: "🎉", label: "Celebration" },
  clap: { emoji: "👏", label: "Clap" },
};

const MAX_STICKERS_PER_DAY = 10;

export async function GET(req) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const toUid = searchParams.get("toUid");

  if (!toUid) {
    return NextResponse.json({ error: "toUid required" }, { status: 400 });
  }

  const prisma = getPrisma();
  const rows = await prisma.sticker.findMany({
    where: { toUid },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const stickers = rows.map((s) => ({
    id: s.id,
    ...s,
    createdAt: s.createdAt ? new Date(s.createdAt).getTime() : 0,
  }));

  const summary = {};
  stickers.forEach((s) => {
    summary[s.type] = (summary[s.type] || 0) + 1;
  });

  return NextResponse.json({ stickers, summary, types: STICKER_TYPES });
}

export async function POST(req) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { toUid, type } = await req.json();

  if (!toUid || !type) {
    return NextResponse.json({ error: "toUid and type required" }, { status: 400 });
  }
  if (!STICKER_TYPES[type]) {
    return NextResponse.json({ error: "Invalid sticker type" }, { status: 400 });
  }
  if (toUid === auth.user.uid) {
    return NextResponse.json({ error: "You can't send stickers to yourself" }, { status: 400 });
  }

  const prisma = getPrisma();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const sentToday = await prisma.sticker.count({
    where: { fromUid: auth.user.uid, createdAt: { gte: startOfToday } },
  });

  if (sentToday >= MAX_STICKERS_PER_DAY) {
    return NextResponse.json(
      { error: `You can only send ${MAX_STICKERS_PER_DAY} stickers per day` },
      { status: 429 }
    );
  }

  const recipient = await getUserDoc(toUid);
  if (!recipient) {
    return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
  }

  const senderName = auth.userDoc?.name || auth.user.email || "Someone";

  try {
    const created = await prisma.sticker.create({
      data: {
        fromUid: auth.user.uid,
        fromName: senderName,
        toUid,
        toName: recipient.name || "Member",
        type,
        emoji: STICKER_TYPES[type].emoji,
        createdAt: new Date(),
      },
    });

    await logAudit({
      actorId: auth.user.uid,
      actorName: senderName,
      action: "sticker.sent",
      targetId: toUid,
      metadata: { type, stickerId: created.id },
    });

    return NextResponse.json({ ok: true, id: created.id });
  } catch (err) {
    logError("stickers.create_prisma_failed", { error: err.message });
    return NextResponse.json({ error: "Could not send sticker" }, { status: 500 });
  }
}