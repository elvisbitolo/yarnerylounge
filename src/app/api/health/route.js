import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

// Keep-warm + liveness check. A light DB ping re-opens the Supabase pooler
// connection on cold lambdas so real navigations don't pay that cost; the
// response is always a 200 so Vercel cron can ping it every minute.
export async function GET() {
  let db = "skipped";
  try {
    const prisma = getPrisma();
    if (prisma) {
      await prisma.$queryRaw`SELECT 1`;
      db = "ok";
    }
  } catch {
    db = "error";
  }
  return NextResponse.json({ ok: true, db, ts: Date.now() });
}