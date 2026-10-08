import { redirect } from "next/navigation";
import AccountTabs from "../AccountTabs";
import EmailNotifications from "../EmailNotifications";
import PushStatus from "../PushStatus";
import NotificationPreferences from "@/components/NotificationPreferences";
import styles from "../account.module.css";
import { loadAccount } from "../account-data";

export const dynamic = "force-dynamic";

export default async function AccountNotificationsPage() {
  const data = await loadAccount();
  if (!data) redirect("/login");
  const { user, userDoc } = data;

  return (
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Notifications</h1>
        </header>
        <AccountTabs />
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Notification preferences</h2>
          <EmailNotifications enabled={userDoc?.notifications} />
          <PushStatus />
        </section>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Granular notification preferences</h2>
          <p className={styles.hint}>Control which types of in-app notifications you receive.</p>
          <NotificationPreferences />
        </section>
      </div>
  );
}