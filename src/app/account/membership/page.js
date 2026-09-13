import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getAccessSub } from "@/lib/server/subscription";
import { tierLabel } from "@/lib/server/plans";
import Nav from "@/components/Nav";
import AccountTabs from "../AccountTabs";
import styles from "../account.module.css";

export const dynamic = "force-dynamic";

export default async function MembershipPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [userDoc, sub] = await Promise.all([
    getUserDoc(user.uid).catch(() => null),
    getAccessSub(user.uid).catch(() => null),
  ]);

  const memberSince = userDoc?.createdAt
    ? userDoc.createdAt.toMillis
      ? userDoc.createdAt.toMillis()
      : new Date(userDoc.createdAt).getTime()
    : null;

  return (
    <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <AccountTabs />
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>My membership</h2>
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
      </div>
    </Nav>
  );
}