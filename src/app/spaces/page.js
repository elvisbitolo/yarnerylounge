import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { listSpaces, getSpaceMembers, isSpaceMember } from "@/lib/server/spaces";
import { getPurchasedKeys } from "@/lib/server/purchases";
import Nav from "@/components/Nav";
import SpacesBoard from "./SpacesBoard";
import styles from "./spaces.module.css";

export const dynamic = "force-dynamic";

export default async function SpacesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  const spaces = await listSpaces();
  const purchasedKeys = await getPurchasedKeys(user.uid);
  const visible = [];
  for (const space of spaces) {
    if (space.status !== "active") continue;
    if (space.access === "invite" && !(await isSpaceMember(space.id, user.uid))) continue;
    const members = await getSpaceMembers(space.id);
    const membership = await isSpaceMember(space.id, user.uid);
    visible.push({
      id: space.id,
      name: space.name,
      slug: space.slug,
      description: space.description || "",
      access: space.access,
      requiredTier: space.requiredTier || "",
      purchasePriceCents: Number(space.purchasePriceCents) || 0,
      features: space.features || {},
      memberCount: members.length,
      joined: !!membership,
      purchased: purchasedKeys.has(`space:${space.id}`),
    });
  }

  return (
      <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Spaces</h1>
          {userDoc?.role === "owner" && (
            <Link className={styles.adminLink} href="/admin/spaces">Manage spaces</Link>
          )}
        </div>
        <p className={styles.subtitle}>
          Spaces bring together feeds, chats, courses, events and live lounges in one place.
        </p>

        {visible.length === 0 ? (
          <p className={styles.empty}>No spaces yet — check back soon.</p>
        ) : (
          <SpacesBoard spaces={visible} uid={user.uid} />
        )}
      </div>
</Nav>
  );
}
