import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getSubscription } from "@/lib/server/subscription";
import { subscriptionStatus } from "@/lib/server/billing";
import { tierLabel } from "@/lib/server/plans";
import AccountTabs from "../AccountTabs";
import CancelPlan from "./CancelPlan";
import styles from "../account.module.css";

export const dynamic = "force-dynamic";

const STATUS_TEXT = {
  active: "Active",
  trialing: "Trial",
  past_due: "Payment past due",
  cancel_at_period_end: "Cancels at period end",
  canceled: "Canceled",
  paused: "Paused",
  incomplete: "Incomplete",
  inactive: "Expired",
};

export default async function MembershipPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [userDoc, sub] = await Promise.all([
    getUserDoc(user.uid).catch(() => null),
    getSubscription(user.uid).catch(() => null),
  ]);

  const memberSince = userDoc?.createdAt
    ? userDoc.createdAt.toMillis
      ? userDoc.createdAt.toMillis()
      : new Date(userDoc.createdAt).getTime()
    : null;

  // Read the persisted subscription, not the synthetic open-access tier, so
  // this account page always reflects the member's actual purchase/cancellation.
  const tier = sub?.tier || userDoc?.plan || "flirting";
  const isPaidTier = ["hooking-up", "moving-in"].includes(tier);
  const status = isPaidTier ? subscriptionStatus(sub) : sub?.status === "canceled" ? "canceled" : "none";
  const statusText = isPaidTier ? STATUS_TEXT[status] || "Active" : status === "canceled" ? "Canceled" : "Free tier";
  const statusTone =
    isPaidTier && (status === "active" || status === "trialing")
      ? `${styles.badge} ${styles.badgeActive}`
      : status === "canceled" || status === "inactive"
        ? `${styles.badge} ${styles.badgeInactive}`
        : styles.badge;
  const canCancel = isPaidTier && ["active", "trialing", "past_due", "cancel_at_period_end"].includes(status);

  return (
    <div className={styles.container}>
      <AccountTabs />
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>My membership</h2>
        <div className={styles.row}>
          <span className={styles.label}>Status</span>
          <span className={styles.value}>
            <span className={statusTone}>{statusText}</span>
          </span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Plan</span>
          <span className={styles.value}>
            {tierLabel(tier)}
            {userDoc?.foundingMember && (
              <span className={`${styles.badge} ${styles.badgeFounding}`}>Founding Yarnie 🧶</span>
            )}
          </span>
        </div>
        {sub?.canceledAt && (
          <div className={styles.row}>
            <span className={styles.label}>Canceled on</span>
            <span className={styles.value}>
              {new Date(sub.canceledAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
            </span>
          </div>
        )}
        {memberSince && (
          <div className={styles.row}>
            <span className={styles.label}>Member since</span>
            <span className={styles.value}>
              {new Date(memberSince).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </span>
          </div>
        )}
        {canCancel && <CancelPlan planLabel={tierLabel(tier)} />}
        {!isPaidTier && (
          <p className={styles.formNotice}>You are on the free Flirting tier. You can choose a paid plan again whenever you are ready.</p>
        )}
      </section>
    </div>
  );
}
