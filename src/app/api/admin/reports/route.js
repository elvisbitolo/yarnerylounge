import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc, canModerate } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const userDoc = await getUserDoc(user.uid);
  if (!canModerate(userDoc)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const prisma = getPrisma();
  try {
    const rows = await prisma.report.findMany({
      where: { status: "open" },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const reports = rows.map((r) => ({
      ...r,
      createdAt: r.createdAt ? r.createdAt.getTime() : r.createdAt,
    }));
    return NextResponse.json({ reports });
  } catch (err) {
    logError("admin.reports.prisma_failed", { error: err.message });
    return NextResponse.json({ reports: [] });
  }
}