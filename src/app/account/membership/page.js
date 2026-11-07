import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getSubscription } from "@/lib/server/subscription";
import { subscriptionStatus } from "@/lib/server/billing";
import { tierLabel } from "@/lib/server/plans";
import { getPrisma } from "@/lib/db/prisma";
import Link from "next/link";
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

  const prisma = getPrisma();
  const [userDoc, sub, payments] = await Promise.all([
    getUserDoc(user.uid).catch(() => null),
    getSubscription(user.uid).catch(() => null),
    prisma
      ? prisma.membershipPayment.findMany({
          where: { userId: user.uid },
          orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
          take: 20,
        }).catch(() => [])
      : Promise.resolve([]),
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
        {sub?.currentPeriodEnd && isPaidTier && status !== "canceled" && (
          <div className={styles.row}>
            <span className={styles.label}>Access through</span>
            <span className={styles.value}>
              {new Date(sub.currentPeriodEnd).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
            </span>
          </div>
        )}
        {canCancel && <CancelPlan planLabel={tierLabel(tier)} />}
        {!isPaidTier && (
          <div className={styles.formNotice}>
            <p>You are on the free Flirting tier. Your paid features are not active.</p>
            <Link className={styles.link} href="/membership">Choose a plan again →</Link>
          </div>
        )}
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Membership benefits</h2>
        <p className={styles.formNotice}>Compare the three membership levels and see exactly what each one includes.</p>
        <div className={styles.membershipComparison}>
          <article className={styles.membershipTier}>
            <h3>Flirting</h3>
            <p>Free community access</p>
            <ul>
              <li>Front Parlor community</li>
              <li>Community calendar and events</li>
              <li>Share photos of your yarn creations</li>
            </ul>
          </article>
          <article className={styles.membershipTier}>
            <h3>Hooking Up</h3>
            <p>Everything in Flirting, plus</p>
            <ul>
              <li>Access to member live lounges</li>
              <li>Lounge chat and Daily Match</li>
              <li>Join crochet circles and community groups</li>
            </ul>
          </article>
          <article className={styles.membershipTier}>
            <h3>Moving In</h3>
            <p>Everything in Hooking Up, plus</p>
            <ul>
              <li>Host public and private live rooms</li>
              <li>Create crochet circles and subgroups</li>
              <li>Exclusive Diamond profile badge</li>
            </ul>
          </article>
        </div>
        <Link className={styles.link} href="/membership#plans">View full plan comparison and available checkout options →</Link>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Payment history</h2>
        <p className={styles.formNotice}>Confirmed Shopify membership payments appear here. Refunds and canceled orders are labeled separately.</p>
        {payments.length ? (
          <div className={styles.paymentList}>
            {payments.map((payment) => (
              <article className={styles.paymentItem} key={payment.id}>
                <div className={styles.paymentDetails}>
                  <strong>{tierLabel(payment.tier || payment.plan || "flirting")}</strong>
                  <span>{payment.orderNumber || `Order #${payment.providerOrderId}`}</span>
                  <time dateTime={payment.paidAt?.toISOString?.() || payment.createdAt.toISOString()}>
                    {new Date(payment.paidAt || payment.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                  </time>
                </div>
                <div className={styles.paymentAmount}>
                  <strong>{new Intl.NumberFormat(undefined, { style: "currency", currency: payment.currency || "USD" }).format(payment.amountCents / 100)}</strong>
                  <span className={payment.status === "paid" ? styles.paymentPaid : styles.paymentOther}>{payment.status}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.formNotice}>No payment records are available yet. New confirmed membership orders will appear here. Earlier purchases are not automatically imported into this history.</p>
        )}
      </section>
      </section>
    </div>
  );
}
