import { NextResponse } from "next/server";
import { requireOwner, guardJson } from "@/lib/server/authorize";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function GET() {
  const auth = await requireOwner();
  const denied = guardJson(auth);
  if (denied) return denied;

  const checkedAt = new Date().toISOString();
  const integrations = {
    database: { configured: Boolean(process.env.DATABASE_URL), status: "unknown" },
    email: { configured: Boolean(process.env.RESEND_API_KEY && (process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM)), status: "configured" },
    whatsapp: { configured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID), webhookVerificationConfigured: Boolean(process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET), status: "configured" },
    browserPush: { configured: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY), status: "configured" },
    scheduledJobs: { configured: Boolean(process.env.CRON_SECRET), status: "configured" },
  };

  for (const item of Object.values(integrations)) {
    if (!item.configured) item.status = "needs_configuration";
  }

  try {
    const prisma = getPrisma();
    if (!prisma) throw new Error("Prisma client unavailable");
    await prisma.$queryRaw`SELECT 1`;
    integrations.database.status = "healthy";
  } catch (error) {
    integrations.database.status = "unhealthy";
    logError("admin.system_health.database_failed", { error: error.message });
  }

  if (integrations.whatsapp.configured && !integrations.whatsapp.webhookVerificationConfigured) {
    integrations.whatsapp.status = "webhook_secret_missing";
  }

  return NextResponse.json({ checkedAt, integrations });
}
