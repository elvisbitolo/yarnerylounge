import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getGroupBySlug, getGroupMembers, isGroupMember } from "@/lib/server/groups";
import { listRoomsForGroup } from "@/lib/server/rooms";
import Nav from "@/components/Nav";
import BackButton from "@/components/BackButton";
import Feed from "@/app/feed/Feed";
import GroupJoinButton from "../GroupJoinButton";
import GroupTopics from "../GroupTopics";
import styles from "../groups.module.css";

export const dynamic = "force-dynamic";

export default async function GroupPage({ params }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  const group = await getGroupBySlug(slug);
  if (!group || group.status !== "active") {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>Group not found</h1>
          <p className={styles.subtitle}>This group is closed or doesn&apos;t exist.</p>
          <Link className={styles.link} href="/groups">Back to groups</Link>
        </div>
      </main>
    );
  }

  const members = await getGroupMembers(group.id);
  const membership = await isGroupMember(group.id, user.uid);
  const memberNames = members.slice(0, 8).map((m) => m.name);
  const groupRooms = await listRoomsForGroup(group.id);
  const activeGroupRooms = groupRooms.filter((room) => room.status === "active");

  return (
      <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <BackButton fallback="/groups" label="All groups" />
        <p className={styles.breadcrumb}>
          <Link className={styles.link} href="/groups">Groups</Link>
          <span className={styles.breadcrumbSep}>/</span>
          <span>{group.name}</span>
        </p>

        <div className={styles.groupHeader}>
          <h1 className={styles.title}>
            {group.emoji ? `${group.emoji} ` : ""}{group.name}
          </h1>
          {group.sidebarDescription && (
            <p className={styles.subtitle}>{group.sidebarDescription}</p>
          )}
          {group.description && (
            <p className={styles.cardDesc}>{group.description}</p>
          )}
          {group.hangoutTag && (
            <p className={styles.hangoutTag} style={{ color: group.color || undefined }}>
              <span className={styles.hangoutDot} style={{ background: group.color || undefined }} />
              {group.emoji ? `${group.emoji} ` : ""}
              <Link className={styles.link} href={`/rooms/${group.hangoutRoomSlug || ""}`}>
                Weekly Hangout · {group.hangoutTag}
              </Link>
            </p>
          )}
          <p className={styles.cardMeta}>
            {members.length} {members.length === 1 ? "member" : "members"}
            {memberNames.length > 0 && (
              <span className={styles.memberNames}> — {memberNames.join(", ")}</span>
            )}
          </p>
          {userDoc?.role === "owner" ? (
            <Link className={styles.groupChatLink} href={`/chat?group=${group.id}`}>
              Group chat
            </Link>
          ) : (
            <GroupJoinButton groupId={group.id} initialJoined={!!membership} />
          )}
          {membership && userDoc?.role !== "owner" && (
            <Link className={styles.groupChatLink} href={`/chat?group=${group.id}`}>
              Group chat
            </Link>
          )}
        </div>

        <h2 className={styles.sectionTitle}>Group feed</h2>
        <div className={styles.groupLayout}>
          <div className={styles.groupMain}>
            {membership || userDoc?.role === "owner" ? (
              <Feed
                uid={user.uid}
                userName={userDoc?.name || user.name || "Member"}
                role={userDoc?.role || "member"}
                groupId={group.id}
              />
            ) : (
              <p className={styles.empty}>Join this group to see and post in its feed.</p>
            )}

            {activeGroupRooms.length > 0 && (
              <>
                <h2 className={styles.sectionTitle}>Group rooms</h2>
                <div className={styles.roomGrid}>
                  {activeGroupRooms.map((room) => (
                    <Link key={room.id} href={`/rooms/${room.slug}`} className={styles.roomCard}>
                      <h3 className={styles.roomName}>{room.name}</h3>
                      {room.description && <p className={styles.roomDesc}>{room.description}</p>}
                      <p className={styles.roomMeta}>Up to {room.maxParticipants} members · live</p>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
          <GroupTopics
            groupId={group.id}
            canPost={!!membership || userDoc?.role === "owner"}
            uid={user.uid}
            userName={userDoc?.name || user.name || "Member"}
          />
        </div>
      </div>
</Nav>
  );
}
