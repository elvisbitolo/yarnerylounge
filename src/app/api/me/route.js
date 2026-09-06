import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { normalizeProfile } from "@/lib/server/profile";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { getGamification } from "@/lib/server/gamification";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const userDoc = await getUserDoc(user.uid);
  const gamification = await getGamification(user.uid, userDoc?.name || "Member");

  const expiresAt = userDoc?.expiresAt
    ? (userDoc.expiresAt.toMillis
        ? userDoc.expiresAt.toMillis()
        : new Date(userDoc.expiresAt).getTime())
    : 0;
  const plan = userDoc?.plan || "flirting";
  const isExpired =
    plan !== "flirting" && expiresAt > 0 && expiresAt < Date.now();

  return NextResponse.json({
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
    points: Number(gamification.points) || 0,
    streak: Number(gamification.streak) || 0,
    bestStreak: Number(gamification.bestStreak) || 0,
    lastVisitDate: gamification.lastVisitDate || "",
    recentVisits: Array.isArray(gamification.recentVisits) ? gamification.recentVisits : [],
    createdAt: userDoc?.createdAt
      ? (userDoc.createdAt.toMillis ? userDoc.createdAt.toMillis() : new Date(userDoc.createdAt).getTime())
      : null,
  });
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
    const taken = await adminDb()
      .collection("users")
      .where("username", "==", patch.username)
      .limit(2)
      .get();
    if (!taken.empty && taken.docs.some((d) => d.id !== user.uid)) {
      return NextResponse.json(
        { error: "That username is already taken", errors: { username: "That username is already taken" } },
        { status: 400 }
      );
    }
  }

  const ref = adminDb().collection("users").doc(user.uid);
  const doc = await ref.get();
  if (doc.exists) {
    await ref.update(patch);
  } else {
    await ref.set({ ...patch, role: "member", createdAt: new Date() });
  }

  if (patch.name) {
    try {
      await adminAuth().updateUser(user.uid, { displayName: patch.name });
    } catch {
      // The profile is saved regardless; the Auth display name sync is best-effort.
    }
  }

  return NextResponse.json({ ok: true, ...patch });
}
