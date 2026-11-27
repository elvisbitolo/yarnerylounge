import { NextResponse } from "next/server";
import { requireOwner, guardJson } from "@/lib/server/authorize";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { PENDING_BILLING_STATUS } from "@/lib/billing-follow-up";

const MAX_TAKE = 200;
const MAX_QUERY_LENGTH = 120;

function serializeEntry(r) {
  return {
    id: r.id,
    actorName: r.actorName || r.actor?.name || "",
    actorEmail: r.actor?.email || "",
    action: r.action,
    targetId: r.targetId || "",
    metadata: r.metadata,
    createdAt: r.createdAt ? r.createdAt.toISOString() : null,
  };
}

export async function GET(req) {
  const auth = await requireOwner();
  const denied = guardJson(auth);
  if (denied) return denied;

  const prisma = getPrisma();
  if (!prisma) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const params = req.nextUrl.searchParams;
  const raw = (params.get("q") || "").trim().slice(0, MAX_QUERY_LENGTH);
  const take = Math.min(Number(params.get("take")) || 100, MAX_TAKE);

  try {
    const [rows, pendingBillingRows] = await Promise.all([
      prisma.auditLog.findMany({
        where: raw
          ? {
              OR: [
                { action: { contains: raw, mode: "insensitive" } },
                { actorName: { contains: raw, mode: "insensitive" } },
                { targetId: { contains: raw, mode: "insensitive" } },
              ],
            }
          : {},
        include: { actor: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take,
      }),
      prisma.auditLog.findMany({
        where: {
          metadata: { path: ["billingStatus"], equals: PENDING_BILLING_STATUS },
        },
        include: { actor: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: MAX_TAKE,
      }),
    ]);

    return NextResponse.json({
      entries: rows.map(serializeEntry),
      pendingBilling: pendingBillingRows.map(serializeEntry),
    });
  } catch (err) {
    logError("admin.audit.query_failed", { error: err.message });
    return NextResponse.json({ error: "Could not load the audit log" }, { status: 500 });
  }
}
