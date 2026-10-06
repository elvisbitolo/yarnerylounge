import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  AUTH_COOKIE,
  getCurrentUserStatus,
  getUserDoc,
} from "@/lib/server/auth";
import { SESSION_OK, SESSION_NEEDS_CONSENT, SESSION_UNAVAILABLE } from "@/lib/server/session-store";
import {
  parseSessionCookie,
  serializeSessionCookie,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/server/auth-core";
import { normalizeProfile } from "@/lib/server/profile";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getGamification } from "@/lib/server/gamification";
import { isOpenAccess } from "@/lib/server/access-policy";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

const PROFILE_COLUMNS = new Set([
  "name",
  "username",
  "headline",
  "location",
  "country",
  "bio",
  "favoriteColors",
  "goToYarn",
  "favoriteHookSize",
  "crafts",
  "hobbies",
  "yearsExperience",
  "favoriteYarnBrand",
  "crochetTechniques",
  "crochetMotivation",
  "learningNext",
  "proudestProject",
  "bestGiftProject",
  "photoURL",
  "coverPhotoURL",
  "notifications",
  "socialLinks",
]);

export async function GET() {
  // getCurrentUser resolves the opaque session cookie against the Postgres
  // Session store and refreshes the access token server-side when needed, so a
  // stale access token never reads as signed-out.
  const current = await getCurrentUserStatus();

  if (current.status === SESSION_UNAVAILABLE) {
    // The Session store or Supabase could not be reached. This is emphatically
    // NOT a sign-out, and the cookie must survive it: /api/me is polled several
    // times per page view (root layout, membership provider, and every page
    // that reads the profile), so treating a blip as "signed out" used to throw
    // away a perfectly healthy session — the member then had to sign in again.
    // Answer "try again" and leave the cookie in place; the next poll resolves it.
    return NextResponse.json(
      { error: "Session temporarily unavailable" },
      { status: 503, headers: { "Retry-After": "5" } }
    );
  }

  // Signed in, session healthy, Terms of Service not yet accepted. This is the
  // one branch that must NOT fall through to the 401 below — clearing the
  // cookie would sign the member out of a perfectly good session and strand
  // them in a /login <-> /consent bounce. Answer 403 (nothing here is usable
  // yet) and leave the cookie alone; the consent screen picks up from it.
  if (current.status === SESSION_NEEDS_CONSENT && current.identity) {
    return NextResponse.json({ error: "terms_consent_required" }, { status: 403 });
  }

  if (current.status !== SESSION_OK || !current.identity) {
    // Genuinely gone (revoked / past the sliding window / suspended) — clear the
    // cookie so the client stops treating this sid as a live session.
    const res = NextResponse.json({ error: "Not signed in" }, { status: 401 });
    res.cookies.set(AUTH_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return res;
  }
  const user = current.identity;
  const userDoc = await getUserDoc(user.uid);
  const gamification = await getGamification(user.uid);

  // The SPA health-checks /api/me constantly; re-issuing the cookie here with a
  // fresh maxAge keeps the 14-day window sliding in the browser, so an active
  // member's cookie never quietly expires while the server session is alive.
  const sid = parseSessionCookie((await cookies()).get(AUTH_COOKIE)?.value)?.sid;

  const expiresAt = userDoc?.expiresAt
    ? (userDoc.expiresAt.toMillis
        ? userDoc.expiresAt.toMillis()
        : new Date(userDoc.expiresAt).getTime())
    : 0;
  const plan = userDoc?.plan || "flirting";
  // While open access is on, tiers do not apply: a member with a lapsed paid
  // plan is never "expired" and is never sent to /plan-expired.
  const isExpired =
    !isOpenAccess() && plan !== "flirting" && expiresAt > 0 && expiresAt < Date.now();

  const payload = {
    uid: user.uid,
    name: userDoc?.name || user.name || user.displayName || "",
    username: userDoc?.username || "",
    email: user.email,
    role: userDoc?.role || "member",
    roleLabel: userDoc?.roleLabel || "",
    plan,
    tier: plan,
    expiresAt,
    isExpired,
    headline: userDoc?.headline || "",
    location: userDoc?.location || "",
    country: userDoc?.country || "",
    bio: userDoc?.bio || "",
    favoriteColors: Array.isArray(userDoc?.favoriteColors) ? userDoc.favoriteColors : [],
    goToYarn: userDoc?.goToYarn || "",
    favoriteHookSize: userDoc?.favoriteHookSize || "",
    proudestProject: userDoc?.proudestProject || "",
    bestGiftProject: userDoc?.bestGiftProject || "",
    photoURL: userDoc?.photoURL || "",
    coverPhotoURL: userDoc?.coverPhotoURL || "",
    notifications: userDoc?.notifications || "on",
    points: Number(gamification?.points) || 0,
    streak: Number(gamification?.streak) || 0,
    bestStreak: Number(gamification?.bestStreak) || 0,
    lastVisitDate: gamification?.lastVisitDate || "",
    recentVisits: Array.isArray(gamification?.recentVisits) ? gamification.recentVisits : [],
    createdAt: userDoc?.createdAt
      ? (userDoc.createdAt.toMillis ? userDoc.createdAt.toMillis() : new Date(userDoc.createdAt).getTime())
      : null,
  };

  const res = NextResponse.json(payload);
  if (sid) {
    res.cookies.set(AUTH_COOKIE, serializeSessionCookie(sid), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  }

  return res;
}

function splitProfilePatch(patch) {
  const columns = {};
  const extra = {};
  for (const [key, value] of Object.entries(patch)) {
    if (PROFILE_COLUMNS.has(key)) columns[key] = value;
    else extra[key] = value;
  }
  return { columns, extra };
}

export async function PATCH(req) {
  // Uses getCurrentUserStatus rather than getCurrentUser, mirroring GET, so a
  // Session store blip is reported as "try again" instead of being mistaken for
  // a revoked session. This handler previously called getCurrentUser(), which
  // this module never imported: every PATCH threw a ReferenceError and returned
  // a bodiless 500, so saving a username showed a raw JSON.parse error.
  const current = await getCurrentUserStatus();

  if (current.status === SESSION_UNAVAILABLE) {
    return NextResponse.json(
      { error: "Session temporarily unavailable" },
      { status: 503, headers: { "Retry-After": "5" } }
    );
  }

  const user = current.status === SESSION_OK ? current.identity : null;
  if (!user) {
    // A member held at the consent screen may not edit their profile yet; 403
    // (not 401) so this never reads as a sign-out and the cookie survives.
    if (current.status === SESSION_NEEDS_CONSENT) {
      return NextResponse.json({ error: "terms_consent_required" }, { status: 403 });
    }
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const limited = rateLimitGuard(`me:${user.uid}`, { limit: 30 });
  if (limited) return limited;

  const body = await req.json();
  const { patch, errors } = normalizeProfile(body || {});

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: Object.values(errors)[0], errors }, { status: 400 });
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  if ("username" in patch && patch.username) {
    let usernameTaken = false;
    try {
      const taken = await getPrisma().user.findMany({
        where: { username: patch.username },
        select: { id: true },
        take: 2,
      });
      usernameTaken = taken.some((u) => u.id !== user.uid);
    } catch (err) {
      logError("profile.username_check_failed", { error: err.message });
    }
    if (usernameTaken) {
      return NextResponse.json(
        { error: "That username is already taken", errors: { username: "That username is already taken" } },
        { status: 400 }
      );
    }
  }

  const prisma = getPrisma();
  const { columns, extra } = splitProfilePatch(patch);
  try {
    const existing = await prisma.user.findUnique({
      where: { id: user.uid },
      select: { id: true, extra: true },
    });
    if (existing) {
      await prisma.user.update({
        where: { id: user.uid },
        data: {
          ...columns,
          ...(Object.keys(extra).length > 0 && {
            extra: { ...(existing.extra || {}), ...extra },
          }),
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.user.create({
        data: {
          id: user.uid,
          name: patch.name || user.displayName || "",
          createdAt: new Date(),
          ...columns,
          ...(Object.keys(extra).length > 0 && { extra }),
          role: "member",
        },
      });
    }

    if (patch.name) {
      try {
        const { default: supabaseAdmin } = await import("@/lib/supabase/service");
        await supabaseAdmin.auth.admin.updateUserById(user.uid, {
          user_metadata: { name: patch.name },
        });
      } catch {
        // The profile is saved regardless; the Auth display name sync is best-effort.
      }
    }

    return NextResponse.json({ ok: true, ...patch });
  } catch (err) {
    logError("profile.update_prisma_failed", { error: err.message });
    return NextResponse.json({ error: "Could not update profile" }, { status: 500 });
  }
}
