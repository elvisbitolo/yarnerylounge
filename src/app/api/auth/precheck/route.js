import { NextResponse } from "next/server";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { logError } from "@/lib/server/log";
import { getPrisma } from "@/lib/db/prisma";
import { mapUserRow } from "@/lib/server/user-core";
import { isOpenAccess, OPEN_ACCESS_PLAN } from "@/lib/server/access-policy";
import { toMillis } from "@/lib/server/user-core";

export const dynamic = "force-dynamic";

const STAFF_ROLES = ["owner", "moderator"];

export async function POST(req) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const limited = rateLimitGuard(`precheck-ip:${ip}`, { limit: 30 });
    if (limited) return limited;

    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }
    const clean = email.toLowerCase().trim();

    // Resolve the local member record for both signup and login guidance.
    // The login form uses only accountExists after a failed credential check;
    // it never receives profile details or credentials from this endpoint.
    const prisma = getPrisma();
    if (!prisma) throw new Error("Database unavailable");
    const userRow = await prisma.user.findFirst({
      where: { email: { equals: clean, mode: "insensitive" } },
    });
    const userDoc = mapUserRow(userRow);

    // Open-access mode admits everyone while the community ramps up.
    if (isOpenAccess()) {
      return NextResponse.json({
        allowed: true,
        email: clean,
        plan: OPEN_ACCESS_PLAN,
        role: "member",
        openAccess: true,
        isNew: !userDoc,
        accountExists: Boolean(userDoc),
      });
    }

    // Registration is open to everyone at the free Flirting tier. A paid
    // Shopify placeholder or active membership is still recognised here so
    // the session exchange can preserve that higher entitlement, but a
    // missing/expired paid record must never block account creation.
    if (!userDoc) {
      return NextResponse.json({
        allowed: true,
        email: clean,
        plan: "flirting",
        role: "member",
        openAccess: false,
        isNew: true,
        accountExists: false,
      });
    }

    const role = userDoc.role || "member";
    const staff = STAFF_ROLES.includes(role);
    const expiresAtMs = toMillis(userDoc.expiresAt);
    const paidAndCurrent =
      userDoc.paymentStatus === "paid" &&
      (staff || expiresAtMs <= 0 || expiresAtMs >= Date.now());

    return NextResponse.json({
      allowed: true,
      email: clean,
      plan: paidAndCurrent ? userDoc.plan || "flirting" : "flirting",
      role,
      openAccess: false,
      isNew: userDoc.id === clean,
      accountExists: true,
    });
  } catch (err) {
    logError("auth.precheck_failed", { error: err.message });
    return NextResponse.json({ error: "Failed to check membership" }, { status: 500 });
  }
}