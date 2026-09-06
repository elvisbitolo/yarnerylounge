import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getSubscription } from "@/lib/server/subscription";
import { subscriptionStatus } from "@/lib/server/billing";
import ExpiredPanel from "./ExpiredPanel";
import styles from "./plan-expired.module.css";

export const dynamic = "force-dynamic";

export default async function PlanExpiredPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);
  const plan = userDoc?.plan || "flirting";
  if (plan === "flirting") redirect("/dashboard");

  const sub = await getSubscription(user.uid);
  const status = subscriptionStatus(sub);
  if (status === "active" || status === "trialing" || status === "past_due") {
    redirect("/dashboard");
  }

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <p className={styles.emoji}>🤫</p>
        <h1 className={styles.title}>Your Key No Longer Works...</h1>
        <p className={styles.subtitle}>
          It looks like your subscription has ended. To get back into the 24/7
          video lounges and continue matching with crafters, renew your plan.
        </p>
        <ExpiredPanel />
      </div>
    </main>
  );
}