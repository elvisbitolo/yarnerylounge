import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getSubscription } from "@/lib/server/subscription";
import { isMembershipExpired } from "@/lib/server/billing";
import { isOpenAccess } from "@/lib/server/access-policy";
import ExpiredPanel from "./ExpiredPanel";
import styles from "./plan-expired.module.css";

export const dynamic = "force-dynamic";

export default async function PlanExpiredPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (isOpenAccess()) redirect("/dashboard");

  const [userDoc, sub] = await Promise.all([
    getUserDoc(user.uid),
    getSubscription(user.uid),
  ]);

  // Keep this decision identical to the dashboard/lounge gate. If the
  // subscription is active, an old User.expiresAt value must not bounce the
  // member between /dashboard and /plan-expired.
  if (!isMembershipExpired(userDoc, sub)) redirect("/dashboard");

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <p className={styles.emoji}>🤫</p>
        <h1 className={styles.title}>Your Key No Longer Works...</h1>
        <p className={styles.subtitle}>
          Your paid membership is not currently active. Renew your plan to
          restore access to the 24/7 video lounges and matching.
        </p>
        <ExpiredPanel />
      </div>
    </main>
  );
}
