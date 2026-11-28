import { NextResponse } from "next/server";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { getPrisma } from "@/lib/db/prisma";
import {
  INTEGRATION_CATALOG,
  defaultCommunityIntegrations,
  buildIntegrationProfileUrl,
  isAllowedIntegrationUrl,
} from "@/lib/integrations/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  try {
    const [user, settings] = await Promise.all([
      prisma.user.findUnique({ where: { id: auth.user.uid }, select: { integrations: true } }),
      prisma.setting.findUnique({ where: { id: "community" }, select: { communityIntegrations: true } }),
    ]);
    const configured = Array.isArray(settings?.communityIntegrations)
      ? settings.communityIntegrations
      : defaultCommunityIntegrations();
    const communityIntegrations = INTEGRATION_CATALOG
      .map((item) => {
        const setting = configured.find((entry) => entry?.id === item.id);
        return { ...item, enabled: setting ? setting.enabled !== false : true, featured: setting ? setting.featured === true : item.featured, communityUrl: setting?.communityUrl || "" };
      })
      .filter((item) => item.enabled);

    return NextResponse.json({
      communityIntegrations,
      personalConnections: user?.integrations && typeof user.integrations === "object" ? user.integrations : {},
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load integrations" }, { status: 500 });
  }
}

export async function PUT(request) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const provider = typeof body?.provider === "string" ? body.provider : "";
  const username = typeof body?.username === "string" ? body.username : "";
  const url = buildIntegrationProfileUrl(provider, username);
  if (!url || !isAllowedIntegrationUrl(provider, url)) {
    return NextResponse.json({ error: "Enter a valid username for this service. Use letters, numbers, dots, underscores or hyphens only." }, { status: 400 });
  }

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  try {
    const user = await prisma.user.findUnique({ where: { id: auth.user.uid }, select: { integrations: true } });
    const connections = user?.integrations && typeof user.integrations === "object" && !Array.isArray(user.integrations)
      ? { ...user.integrations }
      : {};
    connections[provider] = { url, linkedAt: new Date().toISOString() };
    await prisma.user.update({ where: { id: auth.user.uid }, data: { integrations: connections } });
    return NextResponse.json({ personalConnections: connections });
  } catch {
    return NextResponse.json({ error: "Could not save this profile link" }, { status: 500 });
  }
}

export async function DELETE(request) {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const provider = typeof body?.provider === "string" ? body.provider : "";
  if (!INTEGRATION_CATALOG.some((item) => item.id === provider)) {
    return NextResponse.json({ error: "Unknown integration" }, { status: 400 });
  }

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  try {
    const user = await prisma.user.findUnique({ where: { id: auth.user.uid }, select: { integrations: true } });
    const connections = user?.integrations && typeof user.integrations === "object" && !Array.isArray(user.integrations)
      ? { ...user.integrations }
      : {};
    delete connections[provider];
    await prisma.user.update({ where: { id: auth.user.uid }, data: { integrations: connections } });
    return NextResponse.json({ personalConnections: connections });
  } catch {
    return NextResponse.json({ error: "Could not disconnect this profile link" }, { status: 500 });
  }
}
