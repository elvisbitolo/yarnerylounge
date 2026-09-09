import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { logError } from "@/lib/server/log";
import { getPrisma } from "@/lib/db/prisma";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function sanitizeTheme(theme) {
  if (!theme) return null;
  const out = {};
  for (const key of ["bg", "text", "border"]) {
    const value = theme[key];
    if (typeof value === "string" && HEX_COLOR.test(value)) out[key] = value.toLowerCase();
  }
  return Object.keys(out).length >= 2 ? out : null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let cardThemes = {};
  try {
    const row = await getPrisma().user.findUnique({
      where: { id: user.uid },
      select: { extra: true },
    });
    if (row && row.extra?.cardThemes) {
      cardThemes = row.extra.cardThemes;
    }
  } catch (err) {
    logError("card-theme.prisma_read_failed", { error: err.message });
  }
  return NextResponse.json({ themes: cardThemes });
}

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { cardId, theme } = await req.json();
  if (typeof cardId !== "string" || !/^[a-z0-9_-]{1,40}$/i.test(cardId)) {
    return NextResponse.json({ error: "Invalid card id" }, { status: 400 });
  }

  const cleaned = sanitizeTheme(theme);
  try {
    const prisma = getPrisma();
    const existing = await prisma.user.findUnique({
      where: { id: user.uid },
      select: { extra: true },
    });
    const extra = { ...(existing?.extra || {}) };
    const cardThemes = { ...(extra.cardThemes || {}) };
    if (cleaned) {
      cardThemes[cardId] = cleaned;
    } else {
      delete cardThemes[cardId];
    }
    extra.cardThemes = cardThemes;
    await prisma.user.update({
      where: { id: user.uid },
      data: { extra, updatedAt: new Date() },
    });
  } catch (err) {
    logError("card-theme.save_failed", { error: err.message, uid: user.uid });
    return NextResponse.json({ error: "Could not save theme" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, theme: cleaned });
}