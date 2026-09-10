import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { getCapabilities, canUseMatchmaker } from "@/lib/server/capabilities";
import { loungeGate } from "@/lib/server/lounge-gate";
import { listActiveRoomMemberIds } from "@/lib/server/room-presence";
import { QUIZ_QUESTIONS } from "@/lib/profile/questions";
import { BLOCKED_KEY, isSafetyId } from "@/lib/server/member-safety";
import Nav from "@/components/Nav";
import MembersDirectory from "./MembersDirectory";
import BlindDateCard from "./BlindDateCard";
import SimilarMembers from "./SimilarMembers";
import styles from "./members.module.css";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  const prisma = getPrisma();

  const [userRows, gamiRows] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.gamification.findMany(),
  ]);

  const gami = new Map();
  for (const g of gamiRows) {
    gami.set(g.id, {
      points: g.points || 0,
      lastVisitDate: g.lastVisitDate || "",
    });
  }

  const liveUids = new Set(await listActiveRoomMemberIds());
  const caps = await getCapabilities(user.uid);
  const matchmakerEnabled = canUseMatchmaker(caps);
  const gate = await loungeGate(user.uid, userDoc, { matchmaker: true });
  if (gate) redirect(gate);

  const todayKey = (() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();

  const members = userRows
    .filter((m) => m.name && m.id !== user.uid)
    .filter((m) => {
      const viewerExtra = userDoc?.extra && typeof userDoc.extra === "object" ? userDoc.extra : {};
      const memberExtra = m.extra && typeof m.extra === "object" ? m.extra : {};
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
        timezone: extra.timezone || "",
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
        plan: m.plan || "flirting",
        expiresAt: m.expiresAt ? m.expiresAt.getTime() : 0,
        foundingMember: !!m.foundingMember,
        live: liveUids.has(m.id),
        points: gami.get(m.id)?.points || 0,
        lastVisitDate: gami.get(m.id)?.lastVisitDate || "",
        createdAt: m.createdAt ? m.createdAt.getTime() : 0,
      };
    });

  return (
      <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <h1 className={styles.title}>Members</h1>
        <p className={styles.subtitle}>
          {members.length} {members.length === 1 ? "member" : "members"} in the community
        </p>
        <MembersDirectory
          members={members}
          viewer={{
            country: userDoc?.country || "",
            location: userDoc?.location || "",
            timezone: userDoc?.extra?.timezone || "",
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
          matchmakerEnabled={matchmakerEnabled}
        />
        {matchmakerEnabled && <BlindDateCard />}
        {matchmakerEnabled && <SimilarMembers />}
      </div>
</Nav>
  );
}
