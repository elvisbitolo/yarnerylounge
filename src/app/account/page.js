import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import { loadAccount } from "./account-data";
import AccountTabs from "./AccountTabs";
import LogoutButton from "./LogoutButton";
import WelcomeChecklist from "./WelcomeChecklist";
import StreakCard from "./StreakCard";
import ProfileVisibility from "./ProfileVisibility";
import { tierLabel } from "@/lib/server/plans";
import styles from "./account.module.css";

export const dynamic = "force-dynamic";

function initials(name) {
  return (name || "?")
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default async function AccountPage() {
  const data = await loadAccount();
  if (!data) redirect("/login");
  const { user, userDoc, sub, settings, gamification } = data;

  const memberSince = userDoc?.createdAt
    ? userDoc.createdAt.toMillis
      ? userDoc.createdAt.toMillis()
      : new Date(userDoc.createdAt).getTime()
    : null;

  const photoURL = userDoc?.photoURL || user.picture || "";

  return (
    <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.identity}>
            <span className={styles.profileAvatar}>
              {photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoURL} alt="" />
              ) : (
                initials(userDoc?.name || user.name)
              )}
            </span>
            <div>
              <h1 className={styles.title}>{userDoc?.name || user.name}</h1>
              <p className={styles.headerSub}>
                {userDoc?.username
                  ? `@${userDoc.username}`
                  : "Pick a username in Settings so members know you by name"}
              </p>
            </div>
          </div>
          <LogoutButton />
        </header>

        <AccountTabs />

        <StreakCard gamification={gamification} />

        <WelcomeChecklist
          initialProfile={{ name: userDoc?.name || user.name || "", headline: userDoc?.headline || "", location: userDoc?.location || "" }}
          steps={settings?.welcomeChecklist}
        />

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Membership</h2>
          <div className={styles.row}>
            <span className={styles.label}>Status</span>
            <span className={styles.value}>
              <span className={`${styles.badge} ${styles.badgeActive}`}>Active</span>
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Plan</span>
            <span className={styles.value}>
              {tierLabel(sub ? sub.tier : "free")} · {sub ? sub.plan : "Community"}
              {userDoc?.foundingMember && (
                <span className={`${styles.badge} ${styles.badgeFounding}`}>Founding Yarnie 🧶</span>
              )}
            </span>
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
          <h2 className={styles.cardTitle}>Privacy</h2>
          <ProfileVisibility value={userDoc?.extra?.profileVisibility || "public"} />
        </section>
      </div>
    </Nav>
  );
}