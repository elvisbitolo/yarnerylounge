import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { requireUser, guardJson } from "@/lib/server/authorize";
import { logError } from "@/lib/server/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const auth = await requireUser();
  const denied = guardJson(auth);
  if (denied) return denied;

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });

  const uid = auth.user.uid;
  try {
    const row = await prisma.user.findUnique({
      where: { id: uid },
      select: {
        shopifyCustomerAccessToken: true,
        shopifyCustomerEmail: true,
        shopifyCustomerLinkedAt: true,
      },
    });
    return NextResponse.json({
      ok: true,
      linked: Boolean(row?.shopifyCustomerAccessToken),
      email: row?.shopifyCustomerEmail || null,
      linkedAt: row?.shopifyCustomerLinkedAt ? new Date(row.shopifyCustomerLinkedAt).toISOString() : null,
    });
  } catch (error) {
    logError("shopify_status_failed", { error: error.message });
    return NextResponse.json({ error: "Could not read Shopify billing status." }, { status: 502 });
  }
}
