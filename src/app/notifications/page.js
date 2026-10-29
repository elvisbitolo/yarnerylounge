import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { listNotifications } from "@/lib/server/notifications";
import NotificationsList from "./NotificationsList";
import styles from "./notifications.module.css";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const notifications = await listNotifications(user.uid, 50);

  const serialized = await Promise.all(notifications.map(async (n) => {
    let actorPhotoURL = "";
    if (n.actorId) {
      try {
        const actor = await getUserDoc(n.actorId);
        actorPhotoURL = actor?.photoURL || actor?.avatarURL || actor?.image || "";
      } catch {
        // A missing/deleted actor profile should not prevent notifications rendering.
      }
    }

    return {
      id: n.id,
      type: n.type,
      actorName: n.actorName,
      actorPhotoURL,
      href: n.href,
      text: n.text,
      read: n.read,
      createdAt:
        n.createdAt instanceof Date
          ? n.createdAt.toISOString()
          : new Date(n.createdAt.toMillis ? n.createdAt.toMillis() : n.createdAt).toISOString(),
    };
  }));

  return (
      <div className={styles.container}>
        <h1 className={styles.title}>Notifications</h1>
        <p className={styles.subtitle}>Replies, RSVPs, and activity across the community.</p>
        <NotificationsList notifications={serialized} />
      </div>
  );
}
