import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { listGroups, getGroupMembers, isGroupMember } from "@/lib/server/groups";
import { getCapabilities, canBuildNeighborhoods } from "@/lib/server/capabilities";
import GroupsBoard from "./GroupsBoard";
import styles from "./groups.module.css";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  const [groups, capabilities] = await Promise.all([
    listGroups(),
    getCapabilities(user.uid),
  ]);
  const canCreateCircles = canBuildNeighborhoods(capabilities);
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
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
      imageUrl: group.imageUrl || group.avatar || "",
      sidebarDescription: group.sidebarDescription || "",
      hangoutTag: group.hangoutTag || "",
      hangoutRoomSlug: group.hangoutRoomSlug || "",
      emoji: group.emoji || "",
      color: group.color || "",
      memberCount: members.length,
      joined: !!membership,
      parentGroupId: group.parentGroupId || "",
      parentGroupName: group.parentGroupId ? groupNames.get(group.parentGroupId) || "Main circle" : "",
    });
  }

  return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Groups</h1>
          {canCreateCircles && (
            <Link className={styles.adminLink} href="/groups/create">Create a circle</Link>
          )}
          {userDoc?.role === "owner" && (
            <Link className={styles.adminLink} href="/admin/groups">Manage groups</Link>
          )}
        </div>
        <p className={styles.subtitle}>
          Find your people, build around a shared passion, and join the circles that feel like home.
        </p>

        {withCounts.length === 0 ? (
          <p className={styles.empty}>No groups yet — check back soon.</p>
        ) : (
          <GroupsBoard groups={withCounts} uid={user.uid} />
        )}
      </div>
  );
}
