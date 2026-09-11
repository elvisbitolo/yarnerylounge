import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  getCurrentUser,
  getUserDoc,
  rotateCookieSession,
} from "@/lib/server/auth";
import { serializeSupabaseCookie } from "@/lib/server/auth-core";
import { normalizeProfile } from "@/lib/server/profile";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getGamification } from "@/lib/server/gamification";
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
  let user = await getCurrentUser();
  let rotated = null;
  if (!user) {
    // Access token expired but a refresh token exists? Rotate server-side and
    // write the fresh cookie so a stale access token never reads as signed-out.
    rotated = await rotateCookieSession();
    if (rotated && !rotated.error) user = rotated.identity;
  }
  if (!user) {
    const res = NextResponse.json({ error: "Not signed in" }, { status: 401 });
    if (rotated?.error) {
      res.cookies.set(AUTH_COOKIE, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
    }
    return res;
  }
  const userDoc = await getUserDoc(user.uid);
  const gamification = await getGamification(user.uid);

  const expiresAt = userDoc?.expiresAt
    ? (userDoc.expiresAt.toMillis
        ? userDoc.expiresAt.toMillis()
        : new Date(userDoc.expiresAt).getTime())
    : 0;
  const plan = userDoc?.plan || "flirting";
  const isExpired =
    plan !== "flirting" && expiresAt > 0 && expiresAt < Date.now();

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

  if (rotated) {
    const res = NextResponse.json(payload);
    res.cookies.set(
      AUTH_COOKIE,
      serializeSupabaseCookie({ access: rotated.access, refresh: rotated.refresh }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_MAX_AGE_SECONDS,
      }
    );
    return res;
  }
  return NextResponse.json(payload);
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
  const user = await getCurrentUser();
  if (!user) {
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
