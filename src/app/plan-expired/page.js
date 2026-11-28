import { redirect } from "next/navigation";
import { getCurrentUserStatus, getUserDoc } from "@/lib/server/auth";
import { SESSION_GONE, SESSION_NEEDS_CONSENT, SESSION_OK, SESSION_UNAVAILABLE } from "@/lib/server/session-store";
import { getSubscription } from "@/lib/server/subscription";
import { isMembershipExpired } from "@/lib/server/billing";
import { isOpenAccess } from "@/lib/server/access-policy";
import ExpiredPanel from "./ExpiredPanel";
import styles from "./plan-expired.module.css";

export const dynamic = "force-dynamic";

export default async function PlanExpiredPage() {
  const session = await getCurrentUserStatus();
  if (session.status === SESSION_GONE) redirect("/login");
  if (session.status === SESSION_NEEDS_CONSENT) redirect("/consent");

  // A temporary session-store/database outage is not a logout and must not
  // send a healthy member into the login/signing-in redirect chain.
  if (session.status === SESSION_UNAVAILABLE) {
    return (
      <main className={styles.wrap}>
        <div className={styles.card}>
          <h1 className={styles.title}>We can’t verify your session right now.</h1>
          <p className={styles.subtitle}>
            Your account has not been signed out. The membership service is temporarily unavailable.
            Please try again shortly.
          </p>
          <a className={styles.accountLink} href="/plan-expired">Try again</a>
        </div>
      </main>
    );
  }

  if (session.status !== SESSION_OK || !session.identity) redirect("/login");
  const user = session.identity;
  const userDoc = await getUserDoc(user.uid);

  // Owner and moderator access is role-based, not subscription-based.
  // Never send staff accounts through the paid-membership expiry screen.
  if (userDoc?.role === "owner" || userDoc?.role === "moderator") {
    redirect("/dashboard");
  }

  if (isOpenAccess()) redirect("/dashboard");

  const sub = await getSubscription(user.uid);

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
