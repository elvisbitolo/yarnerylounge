import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { mapUserRow } from "@/lib/server/user-core";
import { getRecognitionCount, listRecognitions } from "@/lib/server/recognition";
import { RECOGNITION_VALUES, recognitionCountLabel } from "@/lib/server/recognition-core";
import { BADGES } from "@/lib/server/gamification";
import { QUIZ_QUESTIONS, QUIZ_LABELS, quizHasAnswers, quizAnswerLabel } from "@/lib/profile/questions";
import { roleBadgeLabel } from "@/lib/profile/roles";
import Nav from "@/components/Nav";
import BackButton from "@/components/BackButton";
import FollowButton from "@/components/FollowButton";
import RecognitionForm from "./RecognitionForm";
import StickerDisplay from "./StickerDisplay";
import MembersToExplore from "./MembersToExplore";
import MemberSafetyControls from "./MemberSafetyControls";
import { getMemberSafety } from "@/lib/server/member-safety";
import { listProjects } from "@/lib/server/projects";
import styles from "./profile.module.css";

export const dynamic = "force-dynamic";

function toSerializable(value) {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toMillis === "function") return new Date(value.toMillis()).toISOString();
  return value;
}

const CRAFT_LABELS = {
  crochet: "Crochet",
  knitting: "Knitting",
  weaving: "Weaving",
  spinning: "Spinning",
  dyeing: "Dyeing",
  embroidery: "Embroidery",
  macrame: "Macrame",
};

function formatJoined(value) {
  if (!value) return "";
  const d = value.toMillis ? new Date(value.toMillis()) : new Date(value);
  return d.toLocaleDateString([], { month: "long", year: "numeric" });
}

function commonalities(viewer, member) {
  const found = [];
  if (viewer.country && viewer.country === member.country) {
    found.push({ icon: "🌍", label: `Both in ${member.country}` });
  }
  if (viewer.goToYarn && viewer.goToYarn === member.goToYarn) {
    found.push({ icon: "🧶", label: `Both love ${member.goToYarn}` });
  }
  if (viewer.favoriteHookSize && viewer.favoriteHookSize === member.favoriteHookSize) {
    found.push({ icon: "🪝", label: `Both use a ${member.favoriteHookSize}` });
  }
  if (Array.isArray(viewer.favoriteColors) && Array.isArray(member.favoriteColors)) {
    const overlap = viewer.favoriteColors.filter((c) => member.favoriteColors.includes(c));
    if (overlap.length > 0) {
      found.push({ icon: "🎨", label: `${overlap.length} favorite ${overlap.length === 1 ? "color" : "colors"} in common` });
    }
  }
  if (Array.isArray(viewer.crafts) && Array.isArray(member.crafts)) {
    const overlap = viewer.crafts.filter((c) => member.crafts.includes(c));
    if (overlap.length > 0) {
      found.push({
        icon: "🧵",
        label: `${overlap.length} shared ${overlap.length === 1 ? "craft" : "crafts"}: ${overlap.map((c) => CRAFT_LABELS[c] || c).join(", ")}`,
      });
    }
  }
  if (Array.isArray(viewer.crochetTechniques) && Array.isArray(member.crochetTechniques)) {
    const overlap = viewer.crochetTechniques.filter((t) => member.crochetTechniques.includes(t));
    if (overlap.length > 0) {
      found.push({ icon: "✂️", label: `${overlap.length} shared technique${overlap.length === 1 ? "" : "s"}` });
    }
  }
  if (Array.isArray(viewer.crochetMotivation) && Array.isArray(member.crochetMotivation)) {
    const overlap = viewer.crochetMotivation.filter((m) => member.crochetMotivation.includes(m));
    if (overlap.length > 0) {
      found.push({ icon: "💭", label: `${overlap.length} shared reason${overlap.length === 1 ? "" : "s"} you crochet` });
    }
  }
  for (const q of QUIZ_QUESTIONS) {
    const v = quizAnswerLabel(q, viewer);
    const m = quizAnswerLabel(q, member);
    if (v && m && v === m) found.push({ icon: "✨", label: `Both picked “${m}”` });
  }
  return found.slice(0, 6);
}

export default async function MemberProfilePage({ params }) {
  const { id } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");

  const viewerDoc = await getUserDoc(viewer.uid);
  const isSelf = viewer.uid === id;

  const prisma = getPrisma();

  const [memberRow, postRows, projectRows, recognitionCount, recognitions, stickerRows, gamiRow, followData, safetyData] = await Promise.all([
    prisma.user.findUnique({ where: { id } }),
    prisma.post.findMany({ where: { authorId: id } }),
    listProjects(id),
    getRecognitionCount(id),
    listRecognitions(id, 10),
    prisma.sticker.findMany({ where: { toUid: id } }),
    prisma.gamification.findUnique({ where: { id } }),
    (async () => {
      if (isSelf) return { following: false, followerCount: 0, followingCount: 0 };
      const { isFollowing, getFollowerCount, getFollowingCount } = await import("@/lib/server/follows");
      const [fol, fc, fgc] = await Promise.all([
        isFollowing(viewer.uid, id),
        getFollowerCount(id),
        getFollowingCount(id),
      ]);
      return { following: fol, followerCount: fc, followingCount: fgc };
    })(),
    getMemberSafety(viewer.uid, id).catch(() => ({ blocked: false, muted: false })),
  ]);

  const stickerSummary = {};
  for (const row of stickerRows || []) {
    stickerSummary[row.type] = (stickerSummary[row.type] || 0) + 1;
  }

  if (!memberRow) {
    return (
        <Nav role={viewerDoc?.role}>
        <div className={styles.container}>
          <h1 className={styles.title}>Member not found</h1>
          <p className={styles.subtitle}>This member isn&apos;t available.</p>
          <Link className={styles.link} href="/members">Back to members</Link>
        </div>
</Nav>
    );
  }

  const member = mapUserRow(memberRow);
  const gami = gamiRow || {};
  const memberPoints = gami.points || 0;
  const memberStreak = gami.streak || 0;
  const memberJoined = formatJoined(member.createdAt);
  const earnedBadges = Object.entries(BADGES)
    .filter(([code]) => gami.badges?.[code])
    .map(([code, meta]) => ({
      code,
      name: meta.name,
      description: meta.description,
      earnedAt: gami.badges[code].earnedAt,
    }))
    .sort((a, b) => new Date(b.earnedAt || 0) - new Date(a.earnedAt || 0));
  const memberSimilarities = isSelf ? [] : commonalities(viewerDoc, member);
  const posts = (postRows || [])
    .map((row) => ({
      id: row.id,
      ...row,
      createdAt: toSerializable(row.createdAt),
    }))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 20);
  const projects = projectRows || [];

const coverUrl = member.coverPhotoURL || "";
  const bannerBackground = coverUrl
    ? `url(${coverUrl}) center / cover no-repeat`
    : "linear-gradient(135deg, #fdf1f3, #fbe3ec, #efd9d6)";

  return (
      <Nav role={viewerDoc?.role}>
      <div className={styles.container}>
        <BackButton fallback="/members" label="All members" />

        <div className={styles.profileCard}>
          {bannerBackground && <div className={styles.banner} style={{ background: bannerBackground }} />}
          <div className={styles.header}>
          <div className={styles.avatar}>
            {member.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.avatarImg} src={member.photoURL} alt={member.name || "Member"} />
            ) : (
              (member.name || "?").slice(0, 1).toUpperCase()
            )}
          </div>
          <div className={styles.headerBody}>
            <h1 className={styles.title}>
              {member.name}
              {member.role === "owner" && (
                <span className={styles.ownerBadge}>{roleBadgeLabel(member.role, member.roleLabel)}</span>
              )}
              {member.foundingMember && (
                <span className={styles.foundingBadge}>Founding Yarnie 🧶</span>
              )}
            </h1>
            {member.username && <p className={styles.username}>@{member.username}</p>}
            {member.headline && <p className={styles.headline}>{member.headline}</p>}
            {member.location && <p className={styles.location}>{member.location}</p>}
            {member.country && <p className={styles.location}>{member.country}</p>}
            {member.bio && <p className={styles.bio}>{member.bio}</p>}
            {Array.isArray(member.socialLinks) && member.socialLinks.length > 0 && (
              <div className={styles.socialLinks}>
                {member.socialLinks.map((link, i) => (
                  <a
                    key={i}
                    className={styles.socialLink}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={link.platform}
                  >
                    <span className={styles.socialIcon}>
                      {link.platform === "instagram" && "📷"}
                      {link.platform === "tiktok" && "🎵"}
                      {link.platform === "youtube" && "▶"}
                      {link.platform === "facebook" && "👤"}
                      {link.platform === "twitter" && "𝕏"}
                      {link.platform === "etsy" && "🛍"}
                      {link.platform === "pinterest" && "📌"}
                      {link.platform === "ravelry" && "🧶"}
                      {link.platform === "website" && "🌐"}
                      {link.platform === "other" && "🔗"}
                    </span>
                    <span className={styles.socialLabel}>
                      {link.platform === "twitter" ? "X / Twitter" : link.platform.charAt(0).toUpperCase() + link.platform.slice(1)}
                    </span>
                  </a>
                ))}
              </div>
            )}
            {(member.favoriteColors?.length > 0 ||
              member.crafts?.length > 0 ||
              member.goToYarn ||
              member.favoriteHookSize ||
              member.yearsExperience ||
              member.favoriteYarnBrand ||
              member.crochetTechniques?.length > 0 ||
              member.crochetMotivation?.length > 0 ||
              member.learningNext ||
              member.proudestProject ||
              member.bestGiftProject ||
              quizHasAnswers(member)) && (
              <div className={styles.yarnProfile}>
                {member.favoriteColors?.length > 0 && (
                  <div className={styles.yarnRow}>
                    <span className={styles.yarnLabel}>Favorite colors</span>
                    <span className={styles.colorDots}>
                      {member.favoriteColors.map((color, i) => (
                        <span
                          key={i}
                          className={styles.colorDot}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </span>
                  </div>
                )}
                {Array.isArray(member.crafts) && member.crafts.length > 0 && (
                  <div className={styles.yarnRow}>
                    <span className={styles.yarnLabel}>Crafts</span>
                    <span className={styles.craftTags}>
                      {member.crafts.map((craft) => (
                        <span key={craft} className={styles.craftTag}>
                          {CRAFT_LABELS[craft] || craft}
                        </span>
                      ))}
                    </span>
                  </div>
                )}
                {member.goToYarn && (
                  <p className={styles.yarnRow}>
                    <span className={styles.yarnLabel}>Go-to yarn</span>
                    <span className={styles.yarnValue}>{member.goToYarn}</span>
                  </p>
                )}
                {member.favoriteHookSize && (
                  <p className={styles.yarnRow}>
                    <span className={styles.yarnLabel}>Favorite hook</span>
                    <span className={styles.yarnValue}>{member.favoriteHookSize}</span>
                  </p>
                )}
                {member.yearsExperience && (
                  <p className={styles.yarnRow}>
                    <span className={styles.yarnLabel}>Crocheting for</span>
                    <span className={styles.yarnValue}>{member.yearsExperience}</span>
                  </p>
                )}
                {member.favoriteYarnBrand && (
                  <p className={styles.yarnRow}>
                    <span className={styles.yarnLabel}>Favorite yarn brand</span>
                    <span className={styles.yarnValue}>{member.favoriteYarnBrand}</span>
                  </p>
                )}
                {Array.isArray(member.crochetTechniques) && member.crochetTechniques.length > 0 && (
                  <div className={styles.yarnRow}>
                    <span className={styles.yarnLabel}>Techniques</span>
                    <span className={styles.craftTags}>
                      {member.crochetTechniques.map((technique) => (
                        <span key={technique} className={styles.craftTag}>
                          {technique.charAt(0).toUpperCase() + technique.slice(1)}
                        </span>
                      ))}
                    </span>
                  </div>
                )}
                {Array.isArray(member.crochetMotivation) && member.crochetMotivation.length > 0 && (
                  <div className={styles.yarnRow}>
                    <span className={styles.yarnLabel}>Why I crochet</span>
                    <span className={styles.craftTags}>
                      {member.crochetMotivation.map((motive) => (
                        <span key={motive} className={styles.craftTag}>
                          {motive.charAt(0).toUpperCase() + motive.slice(1)}
                        </span>
                      ))}
                    </span>
                  </div>
                )}
                {member.learningNext && (
                  <p className={styles.yarnRow}>
                    <span className={styles.yarnLabel}>Learning next</span>
                    <span className={styles.yarnValue}>{member.learningNext}</span>
                  </p>
                )}
                {member.proudestProject && (
                  <p className={styles.yarnRow}>
                    <span className={styles.yarnLabel}>Proudest project</span>
                    <span className={styles.yarnValue}>{member.proudestProject}</span>
                  </p>
                )}
                {member.bestGiftProject && (
                  <p className={styles.yarnRow}>
                    <span className={styles.yarnLabel}>Best for gifting</span>
                    <span className={styles.yarnValue}>{member.bestGiftProject}</span>
                  </p>
                )}
                {QUIZ_QUESTIONS.map((q) => {
                  const answer = quizAnswerLabel(q, member);
                  return answer ? (
                    <p key={q.field} className={styles.yarnRow}>
                      <span className={styles.yarnLabel}>{QUIZ_LABELS[q.field]}</span>
                      <span className={styles.yarnValue}>{answer}</span>
                    </p>
                  ) : null;
                })}
              </div>
            )}
            {recognitionCount > 0 && (
              <p className={styles.recognitionCount}>{recognitionCountLabel(recognitionCount)}</p>
            )}
            {!isSelf && (
              <FollowButton
                targetUserId={id}
                initialFollowing={Boolean(followData.following)}
                initialFollowerCount={Number(followData.followerCount) || 0}
                initialFollowingCount={Number(followData.followingCount) || 0}
                isSelf={isSelf}
              />
            )}
            {!isSelf && !safetyData.blocked && (
              <Link className={styles.messageBtn} href={`/chat?with=${id}`}>
                Message
              </Link>
            )}
            {!isSelf && <MemberSafetyControls targetId={id} targetName={member.name} />}
          </div>
          </div>
        </div>

        <section className={styles.projectsSection} aria-labelledby="projects-title">
          <div className={styles.projectsHeader}>
            <h2 id="projects-title" className={styles.sectionTitle}>Project portfolio</h2>
            {isSelf && <Link className={styles.projectManageLink} href="/portfolio">Manage projects</Link>}
          </div>
          {projects.length === 0 ? (
            <p className={styles.empty}>{isSelf ? "Add projects to show the community what you are making." : "No projects added yet."}</p>
          ) : (
            <div className={styles.projectGrid}>
              {projects.map((project) => (
                <article key={project.id} className={styles.projectCard}>
                  {project.imageUrls?.[0] && <img src={project.imageUrls[0]} alt="" className={styles.projectImage} />}
                  <div className={styles.projectBody}>
                    <div className={styles.projectTitleRow}>
                      <h3>{project.title}</h3>
                      {project.featured && <span className={styles.projectFeatured}>Featured</span>}
                    </div>
                    <p className={styles.projectMeta}>{[project.craft, project.projectType, project.status].filter(Boolean).join(" · ")}</p>
                    {project.description && <p className={styles.projectDescription}>{project.description}</p>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <div className={styles.stats}>
          <Link className={styles.statItem} href="/leaderboard">
            <span className={styles.statValue}>{memberPoints}</span>
            <span className={styles.statLabel}>Points</span>
          </Link>
          <span className={styles.statItem}>
            <span className={styles.statValue}>{memberStreak}</span>
            <span className={styles.statLabel}>Day streak</span>
          </span>
          <span className={styles.statItem}>
            <span className={styles.statValue}>{earnedBadges.length}</span>
            <span className={styles.statLabel}>Badges</span>
          </span>
          {memberJoined && (
            <span className={styles.statItem}>
              <span className={styles.statValue}>{memberJoined}</span>
              <span className={styles.statLabel}>Member since</span>
            </span>
          )}
        </div>

        {!isSelf && memberSimilarities.length > 0 && (
          <div className={styles.similarBox}>
            <h2 className={styles.similarTitle}>What you have in common</h2>
            <ul className={styles.similarList}>
              {memberSimilarities.map((s, i) => (
                <li key={i} className={styles.similarItem}>
                  <span className={styles.similarIcon}>{s.icon}</span>
                  <span>{s.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!isSelf && <RecognitionForm toUid={id} values={RECOGNITION_VALUES} />}

        <StickerDisplay
          toUid={id}
          toName={member.name}
          isSelf={isSelf}
          initialSummary={stickerSummary}
        />

        {recognitions.length > 0 && (
          <>
            <h2 className={styles.sectionTitle}>Recognitions</h2>
            <div className={styles.postList}>
              {recognitions.map((rec) => (
                <div key={rec.id} className={styles.post}>
                  <p className={styles.postText}>
                    <Link className={styles.link} href={`/members/${rec.fromUid}`}>
                      {rec.fromName}
                    </Link>{" "}
                    recognized for being <strong>{rec.value}</strong>
                  </p>
                  {rec.note && <p className={styles.bio}>{rec.note}</p>}
                  <p className={styles.postMeta}>
                    {new Date(rec.createdAt).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {earnedBadges.length > 0 && (
          <>
            <h2 className={styles.sectionTitle}>Badges</h2>
            <div className={styles.badgeGrid}>
              {earnedBadges.map((badge) => (
                <div key={badge.code} className={styles.badge}>
                  <span className={styles.badgeIcon}>🏅</span>
                  <p className={styles.badgeName}>{badge.name}</p>
                  <p className={styles.badgeDesc}>{badge.description}</p>
                </div>
              ))}
            </div>
          </>
        )}

        <MembersToExplore forUid={id} />

        <h2 className={styles.sectionTitle}>Recent posts</h2>
        {posts.length === 0 ? (
          <p className={styles.empty}>No posts yet.</p>
        ) : (
          <div className={styles.postList}>
            {posts.map((post) => (
              <article key={post.id} className={styles.post}>
                <p className={styles.postText}>{post.text}</p>
                {post.imageUrl && <img src={post.imageUrl} alt="" className={styles.postImage} />}
                <p className={styles.postMeta}>
                  {post.createdAt ? new Date(post.createdAt.toMillis ? post.createdAt.toMillis() : post.createdAt).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  }) : ""}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
</Nav>
  );
}
