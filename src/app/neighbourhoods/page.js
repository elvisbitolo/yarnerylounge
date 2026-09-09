import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { listGroups, getGroupMembers, isGroupMember } from "@/lib/server/groups";
import Nav from "@/components/Nav";
import GroupJoinButton from "@/app/groups/GroupJoinButton";
import styles from "./neighbourhoods.module.css";

export const dynamic = "force-dynamic";

export default async function NeighbourhoodsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  const groups = await listGroups();
  const withCounts = [];
  for (const group of groups) {
    if (group.status !== "active") continue;
    const members = await getGroupMembers(group.id);
    const membership = await isGroupMember(group.id, user.uid);
    withCounts.push({
      id: group.id,
      name: group.name,
      slug: group.slug,
      description: group.description || "",
      sidebarDescription: group.sidebarDescription || "",
      hangoutTag: group.hangoutTag || "",
      hangoutRoomSlug: group.hangoutRoomSlug || "",
      emoji: group.emoji || "",
      color: group.color || "",
      memberCount: members.length,
      memberNames: members.slice(0, 6).map((m) => m.name),
      joined: !!membership,
    });
  }

  return (
    <Nav role={userDoc?.role}>
      <div className={styles.page}>
        <header className={styles.hero}>
          <h1 className={styles.title}>Neighbourhoods</h1>
          <p className={styles.subtitle}>
            Specialized neighbourhoods built for you — Blanket Guild, the WIP Jail,
            Caffeine &amp; Crochet, the Garment Glam District and more. Pick one, move in,
            and meet the neighbours who share your craft.
          </p>
        </header>

        {withCounts.length === 0 ? (
          <p className={styles.empty}>Neighbourhoods are being built — check back soon.</p>
        ) : (
          <div className={styles.grid}>
            {withCounts.map((hood) => (
              <article key={hood.id} className={styles.card} style={{ "--hoodColor": hood.color || "#e91e63" }}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardEmoji} aria-hidden="true">
                    {hood.emoji || "🧶"}
                  </span>
                  <div className={styles.cardHeading}>
                    <h2 className={styles.cardTitle}>{hood.name}</h2>
                    {hood.sidebarDescription && (
                      <p className={styles.cardTagline}>{hood.sidebarDescription}</p>
                    )}
                  </div>
                </div>

                {hood.description && <p className={styles.cardDesc}>{hood.description}</p>}

                <p className={styles.cardMeta}>
                  <span className={styles.memberCount}>{hood.memberCount} {hood.memberCount === 1 ? "member" : "members"}</span>
                  {hood.memberNames.length > 0 && (
                    <span className={styles.memberNames}>— {hood.memberNames.join(", ")}</span>
                  )}
                </p>

                {hood.hangoutRoomSlug && (
                  <Link
                    href={`/rooms/${hood.hangoutRoomSlug}`}
                    className={styles.hangoutChip}
                  >
                    <span className={styles.hangoutDot} aria-hidden="true" />
                    Weekly hangout · {hood.hangoutTag || hood.name}
                  </Link>
                )}

                <div className={styles.cardActions}>
                  <Link className={styles.enter} href={`/groups/${hood.slug}`}>
                    Enter neighbourhood
                  </Link>
                  {hood.joined ? (
                    <span className={styles.joinedChip}>Joined ✓</span>
                  ) : (
                    <GroupJoinButton groupId={hood.id} initialJoined={false} />
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        <section className={styles.notes}>
          <h2 className={styles.notesTitle}>Inside every neighbourhood</h2>
          <ul className={styles.notesList}>
            <li>
              <strong>A community feed</strong> — chronological posts, photos, polls and wins
              from the people in your neighbourhood.
            </li>
            <li>
              <strong>Topics</strong> — a forum for questions &amp; answers, show-and-tells and
              neighbourhood announcements.
            </li>
            <li>
              <strong>Neighbours</strong> — every member of the network, with the ones in your
              neighbourhood surfaced first.
            </li>
            <li>
              <strong>Their rooms</strong> — neighbourhood hangout rooms appear on the live
              room grid.
            </li>
          </ul>
        </section>
      </div>
    </Nav>
  );
}