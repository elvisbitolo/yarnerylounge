import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getCapabilities, canUseMatchmaker } from "@/lib/server/capabilities";
import { getPrisma } from "@/lib/db/prisma";
import { listActiveRoomMemberIds } from "@/lib/server/room-presence";
import { isOnline } from "@/lib/server/presence-core";
import { QUIZ_QUESTIONS } from "@/lib/profile/questions";
import { BLOCKED_KEY, isSafetyId } from "@/lib/server/member-safety";
import { LAYOUT_PIN_KEY, isLayoutEditor, sanitizePin } from "@/lib/server/members-layout-core";
import MembersDirectory from "./MembersDirectory";
import BlindDateCard from "./BlindDateCard";
import SimilarMembers from "./SimilarMembers";
import styles from "./members.module.css";

export const dynamic = "force-dynamic";

export default async function MembersPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);
  const params = await searchParams;

  // The member directory is free (Flirting is advertised as able to browse), so
  // this page stays open. But the Blind Date card is part of the paid matchmaker,
  // and it rendered for everyone. Hide just the card for free members.
  const canMatch = canUseMatchmaker(await getCapabilities(user.uid));

  const prisma = getPrisma();

  const [userSettled, gamiSettled] = await Promise.allSettled([
    // Omit coverPhotoURL: the directory never renders it, and it can hold a
    // ~290KB inline data URL. A select is not viable here because the member
    // map reads 14 quiz columns dynamically via QUIZ_QUESTIONS.
    prisma.user.findMany({
      orderBy: { name: "asc" },
      take: 5000,
      omit: { coverPhotoURL: true },
    }),
    prisma.gamification.findMany({ take: 5000 }),
  ]);
  const userRows = userSettled.status === "fulfilled" ? userSettled.value : [];
  const gamiRows = gamiSettled.status === "fulfilled" ? gamiSettled.value : [];

  const gami = new Map();
  for (const g of gamiRows) {
    gami.set(g.id, {
      points: g.points || 0,
      lastVisitDate: g.lastVisitDate || "",
    });
  }

  // listActiveRoomMemberIds reports whether it could actually answer. The
  // previous try/catch around it could never fire, because the helper already
  // swallowed its own errors and returned [] — so a failed presence query was
  // indistinguishable from an empty lounge.
  const { uids: liveUidList, ok: presenceOk } = await listActiveRoomMemberIds();
  const liveUids = new Set(liveUidList);
  const todayKey = (() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();
  const nowMs = (() => new Date().getTime())();

  const members = userRows
    .filter((m) => m.name && !m.suspended && m.id !== user.uid)
    .filter((m) => {
      const memberExtra = m.extra && typeof m.extra === "object" ? m.extra : {};
      if (memberExtra.profileVisibility === "private") {
        const role = userDoc?.role || "member";
        return role === "owner" || role === "moderator";
      }
      const viewerExtra = userDoc?.extra && typeof userDoc.extra === "object" ? userDoc.extra : {};
      return !isSafetyId(viewerExtra, BLOCKED_KEY, m.id) && !isSafetyId(memberExtra, BLOCKED_KEY, user.uid);
    })
    .map((m) => {
      const extra = m.extra && typeof m.extra === "object" ? m.extra : {};
      return {
        id: m.id,
        name: m.name,
        username: m.username || "",
        headline: m.headline || "",
        location: m.location || "",
        country: m.country || "",
        // The User.timezone column is canonical (added and backfilled by
        // prisma/migrations/10_instants_and_user_timezone). extra.timezone is a
        // second, older location that is empty for every real member, so reading
        // it alone meant the map showed nobody's timezone at all.
        timezone: m.timezone || extra.timezone || "",
        bio: m.bio || "",
        photoURL: m.photoURL || "",
        favoriteColors: Array.isArray(m.favoriteColors) ? m.favoriteColors : [],
        crafts: Array.isArray(m.crafts) ? m.crafts : [],
        hobbies: Array.isArray(m.hobbies) ? m.hobbies : [],
        crochetTechniques: Array.isArray(m.crochetTechniques) ? m.crochetTechniques : [],
        skillLevel: extra.skillLevel || m.skillLevel || "",
        yarnPreference: extra.yarnPreference || m.yarnPreference || "",
        hookSize: extra.hookSize || m.hookSize || "",
        yearsExperience: extra.yearsExperience || m.yearsExperience || "",
        craftInterests: Array.isArray(extra.craftInterests)
          ? extra.craftInterests
          : Array.isArray(m.craftInterests)
            ? m.craftInterests
            : [],
        projectTypes: Array.isArray(extra.projectTypes)
          ? extra.projectTypes
          : Array.isArray(m.projectTypes)
            ? m.projectTypes
            : [],
        communityGoals: Array.isArray(extra.communityGoals)
          ? extra.communityGoals
          : Array.isArray(m.communityGoals)
            ? m.communityGoals
            : [],
        goToYarn: m.goToYarn || "",
        favoriteHookSize: m.favoriteHookSize || "",
        favoriteYarnBrand: m.favoriteYarnBrand || "",
        crochetMotivation: Array.isArray(m.crochetMotivation) ? m.crochetMotivation : [],
        learningNext: m.learningNext || "",
        quiz: QUIZ_QUESTIONS.reduce((acc, q) => {
          acc[q.field] = Array.isArray(extra[q.field])
            ? extra[q.field]
            : q.multiple && Array.isArray(m[q.field])
              ? m[q.field]
              : String(extra[q.field] ?? m[q.field] ?? "").trim();
          return acc;
        }, {}),
        role: m.role || "member",
        roleLabel: m.roleLabel || "",
        plan: (m.expiresAt && m.expiresAt.getTime() && m.expiresAt.getTime() < nowMs) ? "flirting" : (m.plan || "flirting"),
        expiresAt: m.expiresAt ? m.expiresAt.getTime() : 0,
        foundingMember: !!m.foundingMember,
        live: liveUids.has(m.id),
        online: isOnline(extra.lastActiveAt, nowMs),
        points: gami.get(m.id)?.points || 0,
        lastVisitDate: gami.get(m.id)?.lastVisitDate || "",
        createdAt: m.createdAt ? m.createdAt.getTime() : 0,
        // Saved constellation coordinate from the layout editor, or null for
        // everyone placed by the automatic spiral.
        layoutPin: sanitizePin(extra[LAYOUT_PIN_KEY]),
      };
    });

  return (
      <div className={styles.container}>
        <h1 className={styles.title}>Members</h1>
        <p className={styles.subtitle}>
          {members.length} {members.length === 1 ? "member" : "members"} in the community
        </p>
        <MembersDirectory
          members={members}
          presenceAvailable={presenceOk}
          viewer={{
            country: userDoc?.country || "",
            location: userDoc?.location || "",
            timezone: userDoc?.timezone || userDoc?.extra?.timezone || "",
            goToYarn: userDoc?.goToYarn || "",
            favoriteHookSize: userDoc?.favoriteHookSize || "",
            skillLevel: userDoc?.extra?.skillLevel || userDoc?.skillLevel || "",
            yarnPreference: userDoc?.extra?.yarnPreference || userDoc?.yarnPreference || "",
            hookSize: userDoc?.extra?.hookSize || userDoc?.hookSize || "",
            favoriteColors: Array.isArray(userDoc?.favoriteColors) ? userDoc.favoriteColors : [],
            crafts: Array.isArray(userDoc?.crafts) ? userDoc.crafts : [],
            hobbies: Array.isArray(userDoc?.hobbies) ? userDoc.hobbies : [],
            crochetTechniques: Array.isArray(userDoc?.crochetTechniques) ? userDoc.crochetTechniques : [],
            quiz: {
              ...(userDoc?.quiz || {}),
              ...Object.fromEntries(
                QUIZ_QUESTIONS.map((q) => [
                  q.field,
                  Array.isArray(userDoc?.extra?.[q.field])
                    ? userDoc.extra[q.field]
                    : String(userDoc?.extra?.[q.field] ?? userDoc?.[q.field] ?? "").trim(),
                ])
              ),
            },
          }}
          role={userDoc?.role}
          todayKey={todayKey}
          initialSearch={typeof params?.q === "string" ? params.q : ""}
          canEditLayout={isLayoutEditor(user)}
        />
        {canMatch ? <BlindDateCard /> : null}
        <SimilarMembers />
      </div>
  );
}
