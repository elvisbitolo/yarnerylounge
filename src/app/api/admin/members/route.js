import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { requireModerator, requireOwner, guardJson } from "@/lib/server/authorize";
import { AUTH_COOKIE } from "@/lib/server/auth";
import { parseSessionCookie } from "@/lib/server/auth-core";
import { createSession } from "@/lib/server/session-store";
import { getSwitchRoot, tagSessionForSwitch } from "@/lib/server/account-switch";
import { isActiveSub } from "@/lib/server/billing";
import { getPrisma } from "@/lib/db/prisma";
import { logAudit } from "@/lib/server/audit";
import { logError } from "@/lib/server/log";
import supabaseAdmin from "@/lib/supabase/service";
import { normalizeAdminRole, resolveAdminMemberStatus } from "@/lib/server/admin-member-update";

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
  const roleResult = normalizeAdminRole(body?.role);
  if (!roleResult.ok) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
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
  const role = roleResult.role || (plan === "moving-in" ? "host" : "member");
  const displayName = name || email.split("@")[0] || "Member";

  // The creator owns this account for the saved-account switcher. Deriving the
  // root means an owner who is themselves a child still files the account under
  // the same group.
  const creatorRoot = await getSwitchRoot(auth.userDoc);
  const ownerId = creatorRoot?.rootId || auth.userDoc?.id || null;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: uid,
          ownerId,
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

  // Pre-provision one saved session for the new account so it appears in the
  // creator's switcher without them re-entering the password. Best-effort: the
  // account itself is already created, so a sign-in hiccup must not turn the
  // request into a failure. They can still add it manually via "Add account".
  let switchReady = false;
  if (ownerId) {
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const anonKey =
        process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (supabaseUrl && anonKey) {
        const anon = createClient(supabaseUrl, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data, error } = await anon.auth.signInWithPassword({ email, password });
        if (error || !data?.session?.access_token) {
          logError("admin.members.switch_signin_failed", {
            email,
            error: error?.message,
          });
        } else {
          const sid = await createSession({
            uid,
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token || null,
            switchOwnerId: ownerId,
          });
          if (sid) {
            // Only the owner's own session joins the switcher group. A delegate
            // acting as the owner must not have their session tagged with the
            // principal's root id.
            if (!auth.user.actorUid) {
              const currentSid = parseSessionCookie(
                (await cookies()).get(AUTH_COOKIE)?.value
              )?.sid;
              await tagSessionForSwitch(currentSid, ownerId);
            }
            switchReady = true;
          }
        }
      }
    } catch (err) {
      logError("admin.members.switch_provision_failed", { email, error: err.message });
    }
  }

  await logAudit({
    actorId: auth.user.uid,
    actorName: auth.userDoc?.name || auth.user.email || "",
    action: "member.created",
    targetId: uid,
    metadata: {
      email,
      plan,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      ownerId,
      switchReady,
    },
  });

  return NextResponse.json({
    ok: true,
    switchReady,
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
      const status = resolveAdminMemberStatus(user, sub);
      const isStaff = ["owner", "moderator"].includes(String(user.role || "").toLowerCase());
      const lastSeen = lastSeenMap.get(user.id);
      return {
        id: user.id,
        name: user.name || "",
        email: user.email || "",
        photoURL: user.photoURL || "",
        createdAt: user.createdAt,
        role: user.role || "member",
        roleLabel: user.roleLabel || "",
        plan: isStaff
          ? "moving-in"
          : sub
            ? active ? sub.tier || "flirting" : "flirting"
            : user.plan || "flirting",
        suspended: user.suspended || false,
        foundingMember: !!user.foundingMember,
        expiresAt: user.expiresAt,
        tier: sub && active ? sub.tier || "lounge" : "",
        subStatus: status.code,
        status: status.category,
        statusLabel: status.label,
        lastSeenAt: lastSeen ? lastSeen.toISOString() : null,
      };
    });
    return NextResponse.json({ members });
  } catch (err) {
    logError("admin.members.prisma_failed", { error: err.message });
    return NextResponse.json({ members: [] });
  }
}
