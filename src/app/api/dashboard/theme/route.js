import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { sanitizeTheme } from "@/lib/site-theme-core";
import { logError } from "@/lib/server/log";
import { getPrisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  let theme = null;
  try {
    const row = await getPrisma().user.findUnique({
      where: { id: auth.user.uid },
      select: { extra: true },
    });
    theme = row?.extra?.dashboardTheme || null;
  } catch (err) {
    logError("theme.prisma_read_failed", { error: err.message });
  }

  return NextResponse.json({ theme });
}

export async function POST(req) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const { theme } = await req.json();

  if (!theme || typeof theme !== "object") {
    return NextResponse.json({ error: "Invalid theme" }, { status: 400 });
  }

  const safe = sanitizeTheme(theme);

  try {
    const prisma = getPrisma();
    const existing = await prisma.user.findUnique({
      where: { id: auth.user.uid },
      select: { extra: true },
    });
    const extra = { ...(existing?.extra || {}) };
    extra.dashboardTheme = safe;
    await prisma.user.update({
      where: { id: auth.user.uid },
      data: { extra, updatedAt: new Date() },
    });
  } catch (err) {
    logError("theme.save_failed", { error: err.message, uid: auth.user.uid });
    return NextResponse.json({ error: "Could not save theme" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, theme: safe });
}
