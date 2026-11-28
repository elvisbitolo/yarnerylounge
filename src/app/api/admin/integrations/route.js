import { NextResponse } from "next/server";
import { requireOwner, guardJson } from "@/lib/server/authorize";
import { getPrisma } from "@/lib/db/prisma";
import {
  INTEGRATION_CATALOG,
  defaultCommunityIntegrations,
  isAllowedIntegrationUrl,
} from "@/lib/integrations/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireOwner();
  const denied = guardJson(auth);
  if (denied) return denied;

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  try {
    const settings = await prisma.setting.findUnique({
      where: { id: "community" },
      select: { communityIntegrations: true },
    });
    const saved = Array.isArray(settings?.communityIntegrations)
      ? settings.communityIntegrations
      : defaultCommunityIntegrations();
    const integrations = INTEGRATION_CATALOG.map((item) => {
      const config = saved.find((entry) => entry?.id === item.id);
      return {
        ...item,
        enabled: config ? config.enabled !== false : true,
        featured: config ? config.featured === true : item.featured,
        communityUrl: config?.communityUrl || "",
      };
    });
    return NextResponse.json({ integrations }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load integration settings" }, { status: 500 });
  }
}

export async function PUT(request) {
  const auth = await requireOwner();
  const denied = guardJson(auth);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.integrations) || body.integrations.length > INTEGRATION_CATALOG.length) {
    return NextResponse.json({ error: "Invalid integrations configuration" }, { status: 400 });
  }

  const submitted = new Map();
  for (const item of body.integrations) {
    if (!INTEGRATION_CATALOG.some((entry) => entry.id === item?.id) || submitted.has(item.id)) {
      return NextResponse.json({ error: "Unknown or duplicate integration" }, { status: 400 });
    }
    const communityUrl = typeof item.communityUrl === "string" ? item.communityUrl.trim() : "";
    if (communityUrl && !isAllowedIntegrationUrl(item.id, communityUrl)) {
      return NextResponse.json({ error: "A community link uses an invalid service URL." }, { status: 400 });
    }
    submitted.set(item.id, {
      id: item.id,
      enabled: item.enabled === true,
      featured: item.featured === true,
      communityUrl,
    });
  }

  const integrations = INTEGRATION_CATALOG.map((item) => submitted.get(item.id) || {
    id: item.id,
    enabled: false,
    featured: false,
    communityUrl: "",
  });
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  try {
    await prisma.setting.upsert({
      where: { id: "community" },
      create: { id: "community", communityIntegrations: integrations },
      update: { communityIntegrations: integrations },
    });
    return NextResponse.json({ integrations });
  } catch {
    return NextResponse.json({ error: "Could not save community integrations" }, { status: 500 });
  }
}
