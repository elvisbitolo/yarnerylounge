import Link from "next/link";
import { getCurrentUser } from "@/lib/server/auth";
import { getCapabilities, CAPABILITIES } from "@/lib/server/capabilities";
import { getSubscription } from "@/lib/server/subscription";
import { subscriptionStatus } from "@/lib/server/billing";
import { isOpenAccess } from "@/lib/server/access-policy";
import { SHOPIFY_UPGRADE_URL } from "@/lib/server/shopify";
import TierIcon from "@/components/TierIcon";
import styles from "./membership.module.css";

// This page used to be a bare redirect to the Shopify storefront, so it showed
// the same thing to everybody regardless of what they were already paying for.
// It now reads the member's own plan.
//
// The tier shown here comes from getCapabilities, the same call the Jitsi token
// route uses to enforce the paywall. Reading the plan from anywhere else (the
// user row, a query, a prop) is how a page ends up disagreeing with what the
// app actually lets someone do.
export const dynamic = "force-dynamic";

const SHOP_TIERS = ["flirting", "hooking-up", "moving-in"];

const STATUS_TEXT = {
  none: "Free tier",
  active: "Active",
  trialing: "Trial",
  past_due: "Payment past due",
  cancel_at_period_end: "Cancels at period end",
  canceled: "Canceled",
  paused: "Paused",
  incomplete: "Incomplete",
  inactive: "Expired",
};

function tierEntry(tierKey) {
  const capsKey = tierKey === "moving-in" ? "host" : tierKey === "hooking-up" ? "paid" : "free";
  return { tierKey, caps: CAPABILITIES[capsKey] };
}

// Everything shown per tier is read off the capability matrix rather than
// written out here, so this page cannot advertise something the paywall does
// not actually grant.
function featureRows(caps) {
  return [
    { label: "24/7 video lounges", on: caps.video.canJoin },
    { label: "Go live with camera and mic", on: caps.video.canPublish },
    { label: "Chat", on: caps.chat.read, note: caps.chat.write ? "read & write" : "read only" },
    {
      label: "Daily Match",
      on: caps.matchmaker,
      note: caps.key === "moving-in" ? "priority matches" : undefined,
    },
    { label: "Host a room", on: caps.hosting },
    {
      label: caps.neighborhoods.build
        ? "Create and join groups"
        : caps.neighborhoods.join
          ? "Join groups"
          : "Groups",
      on: caps.neighborhoods.join,
    },
  ];
}

function formatDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default async function MembershipPage() {
  const user = await getCurrentUser();
  const openAccess = isOpenAccess();

  // The enforced tier for this member, or null when signed out.
  const caps = user ? await getCapabilities(user.uid) : null;
  const sub = user ? await getSubscription(user.uid) : null;
  const currentTier = caps?.key || null;
  const currentIndex = currentTier ? SHOP_TIERS.indexOf(currentTier) : -1;
  const onTopTier = currentIndex === SHOP_TIERS.length - 1;

  return (
    <main className={styles.wrap}>
      <div className={styles.inner}>
        <h1 className={styles.title}>Membership</h1>
        <p className={styles.subtitle}>
          {user
            ? "Your current plan, and what each tier includes."
            : "Sign in to see your current plan, or pick a tier below."}
        </p>

        {user && (
          <section className={styles.current}>
            <div className={styles.currentTop}>
              <h2 className={styles.currentLabel}>{caps.label}</h2>
              {caps.profileBadge && (
                <span
                  className={styles.badge}
                  style={{ color: caps.profileBadge.color }}
                >
                  <TierIcon name={caps.profileBadge.icon} size={14} />{" "}
                  {STATUS_TEXT[subscriptionStatus(sub)] || "Active"}
                </span>
              )}
            </div>
            <p className={styles.status}>
              {STATUS_TEXT[subscriptionStatus(sub)] || "Active"}
              {sub?.currentPeriodEnd ? (
                <>
                  {" · "}
                  {subscriptionStatus(sub) === "canceled" ? "ended" : "renews"}{" "}
                  <strong>{formatDate(sub.currentPeriodEnd)}</strong>
                </>
              ) : null}
            </p>
            {openAccess && (
              <p className={styles.notice}>
                Open access is switched on, so every member is currently admitted at
                the top tier and these tiers are not being enforced.
              </p>
            )}
          </section>
        )}

        <div className={styles.ladder}>
          {SHOP_TIERS.map((tierKey, index) => {
            const { caps: tierCaps } = tierEntry(tierKey);
            const isCurrent = tierKey === currentTier;
            // Only ever offer a step up. Telling a Moving In member to upgrade
            // to Moving In is how a page starts nagging people for money.
            const canUpgrade = !isCurrent && currentIndex >= 0 && index > currentIndex;

            return (
              <article
                key={tierKey}
                className={isCurrent ? `${styles.tier} ${styles.tierCurrent}` : styles.tier}
              >
                <div className={styles.tierTop}>
                  <h3 className={styles.tierName}>
                    {tierCaps.profileBadge && (
                      <TierIcon name={tierCaps.profileBadge.icon} size={18} />
                    )}{" "}
                    {tierCaps.label}
                  </h3>
                  {isCurrent && <span className={styles.youAre}>Your plan</span>}
                </div>

                <ul className={styles.features}>
                  {featureRows(tierCaps).map((row) => (
                    <li key={row.label} className={row.on ? undefined : styles.off}>
                      <span className={styles.mark} aria-hidden="true">
                        {row.on ? "✓" : "—"}
                      </span>
                      <span>
                        {row.label}
                        {row.on && row.note ? ` (${row.note})` : ""}
                      </span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <span className={`${styles.cta} ${styles.ctaMuted}`}>Your current plan</span>
                ) : canUpgrade ? (
                  <a
                    className={styles.cta}
                    href={SHOPIFY_UPGRADE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Upgrade to {tierCaps.label}
                  </a>
                ) : user ? (
                  <span className={`${styles.cta} ${styles.ctaMuted}`}>
                    {onTopTier ? "You are on the top tier" : "Included in a higher tier"}
                  </span>
                ) : (
                  <a
                    className={styles.cta}
                    href={SHOPIFY_UPGRADE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Choose {tierCaps.label}
                  </a>
                )}
              </article>
            );
          })}
        </div>

        {!user && (
          <p className={styles.signIn}>
            Already a member?{" "}
            <Link href="/login">Sign in</Link> to see the plan you are on.
          </p>
        )}

        <p className={styles.foot}>
          Purchases are taken on the Secret Yarnery storefront and applied to your
          account automatically. Your access updates as soon as you return to the
          app — no need to sign in again.
        </p>
      </div>
    </main>
  );
}
