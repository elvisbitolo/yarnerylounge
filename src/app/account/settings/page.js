import { redirect } from "next/navigation";
import AccountTabs from "../AccountTabs";
import UsernameForm from "../UsernameForm";
import LogoutButton from "../LogoutButton";
import styles from "../account.module.css";
import { loadAccount } from "../account-data";

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const data = await loadAccount();
  if (!data) redirect("/login");
  const { user, userDoc } = data;

  const memberSince = userDoc?.createdAt
    ? userDoc.createdAt.toMillis
      ? userDoc.createdAt.toMillis()
      : new Date(userDoc.createdAt).getTime()
    : null;

  return (
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Settings</h1>
        </header>
        <AccountTabs />

        <UsernameForm initialUsername={userDoc?.username || ""} />

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Your account</h2>
          <div className={styles.row}>
            <span className={styles.label}>Email</span>
            <span className={styles.value}>{user.email}</span>
          </div>
          {memberSince && (
            <div className={styles.row}>
              <span className={styles.label}>Member since</span>
              <span className={styles.value}>
                {new Date(memberSince).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </span>
            </div>
          )}
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Session</h2>
          <div className={styles.row}>
            <div>
              <span className={styles.label}>Sign out</span>
              <p className={styles.hint}>You can sign back in with your Google account at any time.</p>
            </div>
            <LogoutButton />
          </div>
        </section>
      </div>
  );
}