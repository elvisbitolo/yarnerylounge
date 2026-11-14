import { NextResponse } from "next/server";
import { requireModerator, requireOwner, guardJson } from "@/lib/server/authorize";
import { isActiveSub } from "@/lib/server/billing";
import { getPrisma } from "@/lib/db/prisma";
import { logAudit } from "@/lib/server/audit";
import { logError } from "@/lib/server/log";
import supabaseAdmin from "@/lib/supabase/service";

const VALID_PLANS = ["flirting", "hooking-up", "moving-in"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

// Owner-only endpoint: create a real Supabase Auth account (so the member can
// sign in with the password immediately) plus the matching local User and
// Subscription rows. Plan/expiry are written directly, bypassing Shopify.
export async function POST(req) {
  const auth = await requireOwner();
  const denied = guardJson(auth);
  if (denied) return denied;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  const name = String(body?.name || "").trim().slice(0, 100);
  const plan = String(body?.plan || "flirting").trim().toLowerCase();
  const expiresRaw = body?.expiresAt ? String(body.expiresAt).trim() : "";

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 }
    );
  }
  if (!VALID_PLANS.includes(plan)) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }

  let expiresAt = null;
  if (expiresRaw && plan !== "flirting") {
    // A bare <input type="date"> value is a calendar day. Expire at the end of
    // that day so the member keeps access through it, rather than at midnight.
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(expiresRaw)
      ? `${expiresRaw}T23:59:59.999Z`
      : expiresRaw;
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Enter a valid expiry date." }, { status: 400 });
    }
    expiresAt = parsed;
  }

  const prisma = getPrisma();
  if (!prisma) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, isPrePaid: true },
  });
  if (existing) {
    return NextResponse.json(
      {
        error: existing.isPrePaid
          ? "A Shopify pre-paid record already exists for this email. Have them finish signup instead."
          : "A member with this email already exists.",
      },
      { status: 409 }
    );
  }

  let authUser;
  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: name || email.split("@")[0] },
    });
    if (error) {
      const message = /already|exists|registered/i.test(error.message || "")
        ? "An account with this email already exists."
        : error.message || "Could not create the sign-in account.";
      return NextResponse.json({ error: message }, { status: 409 });
    }
    authUser = data?.user;
  } catch (err) {
    logError("admin.members.create_auth_failed", { email, error: err.message });
    return NextResponse.json({ error: "Could not create the sign-in account." }, { status: 500 });
  }

  if (!authUser?.id) {
    return NextResponse.json({ error: "Could not create the sign-in account." }, { status: 500 });
  }

  const uid = authUser.id;
  // Moving In carries host rights everywhere else in the app, so keep the
  // stored role in sync with the chosen plan (same rule as the PATCH handler).
  const role = plan === "moving-in" ? "host" : "member";
  const displayName = name || email.split("@")[0] || "Member";

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: uid,
          name: displayName,
          email,
          role,
          plan,
          paymentStatus: plan === "flirting" ? "unpaid" : "paid",
          isPrePaid: false,
          expiresAt,
          extra: { welcomeJourneyPending: true },
          createdAt: new Date(),
        },
      });
      await tx.subscription.create({
        data: {
          id: uid,
          userId: uid,
          provider: "admin",
          status: "active",
          plan,
          planName: plan,
          tier: plan,
          role,
          currentPeriodEnd: expiresAt,
          cancelAtPeriodEnd: false,
          updatedAt: new Date(),
        },
      });
    });
  } catch (err) {
    // Do not leave a Supabase login with no membership row behind.
    try {
      await supabaseAdmin.auth.admin.deleteUser(uid);
    } catch (cleanupErr) {
      logError("admin.members.create_cleanup_failed", { uid, error: cleanupErr.message });
    }
    logError("admin.members.create_failed", { email, error: err.message });
    return NextResponse.json({ error: "Could not create member." }, { status: 500 });
  }

  await logAudit({
    actorId: auth.user.uid,
    actorName: auth.userDoc?.name || auth.user.email || "",
    action: "member.created",
    targetId: uid,
    metadata: { email, plan, expiresAt: expiresAt ? expiresAt.toISOString() : null },
  });

  return NextResponse.json({
    ok: true,
    member: {
      id: uid,
      name: displayName,
      email,
      plan,
      role,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    },
  });
}

export async function GET() {
  const auth = await requireModerator();
  const denied = guardJson(auth);
  if (denied) return denied;

  const prisma = getPrisma();
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      take: 500,
      select: {
        id: true,
        name: true,
        email: true,
        photoURL: true,
        createdAt: true,
        role: true,
        roleLabel: true,
        plan: true,
        suspended: true,
        foundingMember: true,
        expiresAt: true,
      },
    });
    const userIds = users.map((u) => u.id);
    const subs = await prisma.subscription.findMany({
      take: 1000,
      select: {
        id: true,
        userId: true,
        tier: true,
        status: true,
        currentPeriodEnd: true,
        trialEnd: true,
      },
    });
    const subMap = new Map();
    for (const sub of subs) {
      subMap.set(sub.userId || sub.id, sub);
      if (sub.id) subMap.set(sub.id, sub);
    }
    // fetch the most recent session per user for "last seen"
    const sessions = await prisma.session.findMany({
      where: { userId: { in: userIds } },
      orderBy: { lastSeenAt: "desc" },
      take: userIds.length,
    });
    const lastSeenMap = new Map();
    for (const s of sessions) {
      if (s.userId) lastSeenMap.set(s.userId, s.lastSeenAt);
    }
    const members = users.map((user) => {
      const sub = subMap.get(user.id) || null;
      const active = isActiveSub(sub);
      const lastSeen = lastSeenMap.get(user.id);
      return {
        id: user.id,
        name: user.name || "",
        email: user.email || "",
        photoURL: user.photoURL || "",
        createdAt: user.createdAt,
        role: user.role || "member",
        roleLabel: user.roleLabel || "",
        plan: ["owner", "moderator"].includes(String(user.role || "").toLowerCase())
          ? "moving-in"
          : sub
            ? active ? sub.tier || "flirting" : "flirting"
            : user.plan || "flirting",
        suspended: user.suspended || false,
        foundingMember: !!user.foundingMember,
        expiresAt: user.expiresAt,
        tier: sub && active ? sub.tier || "lounge" : "",
        subStatus: active
          ? sub.status === "trialing"
            ? "trial"
            : "active"
          : sub
            ? "inactive"
            : "none",
        lastSeenAt: lastSeen ? lastSeen.toISOString() : null,
      };
    });
    return NextResponse.json({ members });
  } catch (err) {
    logError("admin.members.prisma_failed", { error: err.message });
    return NextResponse.json({ members: [] });
  }
}
