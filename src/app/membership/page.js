import Link from "next/link";
import { getCurrentUser } from "@/lib/server/auth";
import { getCapabilities, CAPABILITIES } from "@/lib/server/capabilities";
import { getSubscription } from "@/lib/server/subscription";
import { subscriptionStatus } from "@/lib/server/billing";
import { isOpenAccess } from "@/lib/server/access-policy";
import TierIcon from "@/components/TierIcon";
import styles from "./membership.module.css";

export const dynamic = "force-dynamic";

const SHOP_TIERS = ["flirting", "hooking-up", "moving-in"];

const TIER_PRODUCTS = {
  flirting: {
    monthly: "https://secretyarnery.com/products/flirting-free",
    monthlyLabel: "Join free",
    price: "Free",
  },
  "hooking-up": {
    monthly: "https://secretyarnery.com/products/hooking-up",
    annual: "https://secretyarnery.com/products/hooking-up-annual",
    monthlyLabel: "Monthly — $7.95",
    annualLabel: "Annual — $79.50",
    price: "$7.95/month or $79.50/year",
  },
  "moving-in": {
    monthly: "https://secretyarnery.com/products/moving-in-monthly",
    // The annual product URL is intentionally not guessed. The storefront page
    // offers the available product options and remains the safe fallback.
    annual: "https://secretyarnery.com/pages/speakeasy",
    monthlyLabel: "Monthly — $17.95",
    annualLabel: "Annual — $179.50",
    price: "$17.95/month or $179.50/year",
  },
};

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

// Base community features are shared across all three tiers. Capability-backed
// items use the same matrix as the server-side paywall, avoiding a sales page
// that promises a video/chat/hosting entitlement the app does not grant.
function featureRows(tierKey, caps) {
  const base = [
    { label: "Front Parlor community access", on: true },
    { label: "Create your Hooking Up profile", on: true },
    { label: "Calendar and community events", on: true },
    { label: "Share pictures of your yarn creations", on: true },
  ];

  const paid = [
    {
      label: "24/7 live video lounges",
      on: caps.video.canJoin,
      note: caps.video.canJoin ? "member access; room capacity and schedules still apply" : undefined,
    },
    { label: "Live video with camera and microphone", on: caps.video.canPublish },
    { label: "Lounge text chat", on: caps.chat.read, note: caps.chat.write ? "read and send messages" : "read only" },
    { label: "Daily Match", on: caps.matchmaker },
    { label: "Join crochet circles and community groups", on: caps.neighborhoods.join },
  ];

  const host = [
    { label: "Host your own public or private live rooms", on: caps.hosting },
    { label: "Create and launch crochet circles / subgroups", on: caps.neighborhoods.build },
    { label: "Exclusive Diamond profile badge", on: tierKey === "moving-in" },
  ];

  return [...base, ...paid, ...host];
}

function formatDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function ProductLinks({ tierKey, compact = false }) {
  const product = TIER_PRODUCTS[tierKey];
  const links = [
    { key: "monthly", href: product.monthly, label: product.monthlyLabel },
    ...(product.annual ? [{ key: "annual", href: product.annual, label: product.annualLabel }] : []),
  ];

  return (
    <div className={compact ? styles.productLinksCompact : styles.productLinks}>
      {links.map((link) => (
        <a
          key={link.key}
          className={styles.cta}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}

export default async function MembershipPage() {
  const user = await getCurrentUser();
  const openAccess = isOpenAccess();
  const caps = user ? await getCapabilities(user.uid) : null;
  const sub = user ? await getSubscription(user.uid) : null;
  const currentTier = caps?.key || null;
  const currentIndex = currentTier ? SHOP_TIERS.indexOf(currentTier) : -1;

  return (
    <main className={styles.wrap}>
      <div className={styles.inner}>
        <h1 className={styles.title}>Find your place in the Speakeasy</h1>
        <p className={styles.subtitle}>
          Three ways to belong: explore the Front Parlor for free, join the live lounge,
          or become a host and build a community of your own.
        </p>

        {user && (
          <section className={styles.current}>
            <div className={styles.currentTop}>
              <h2 className={styles.currentLabel}>{caps.label}</h2>
              {caps.profileBadge && (
                <span className={styles.badge} style={{ color: caps.profileBadge.color }}>
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
                  {subscriptionStatus(sub) === "canceled" ? "ends" : "renews"}{" "}
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
          {SHOP_TIERS.map((tierKey) => {
            const { caps: tierCaps } = tierEntry(tierKey);
            const isCurrent = tierKey === currentTier;
            const index = SHOP_TIERS.indexOf(tierKey);
            const canUpgrade = !isCurrent && currentIndex >= 0 && index > currentIndex;
            const product = TIER_PRODUCTS[tierKey];

            return (
              <article
                key={tierKey}
                className={isCurrent ? `${styles.tier} ${styles.tierCurrent}` : styles.tier}
              >
                <div className={styles.tierTop}>
                  <h3 className={styles.tierName}>
                    {tierCaps.profileBadge && <TierIcon name={tierCaps.profileBadge.icon} size={18} />}{" "}
                    {tierCaps.label}
                  </h3>
                  {isCurrent && <span className={styles.youAre}>Your plan</span>}
                </div>
                <p className={styles.tierHandle}>
                  {tierKey === "flirting"
                    ? "The Front Parlor Pass"
                    : tierKey === "hooking-up"
                      ? "The Main Floor Ticket"
                      : "The Resident Key"}
                </p>
                <p className={styles.price}>{product.price}</p>

                <ul className={styles.features}>
                  {featureRows(tierKey, tierCaps).map((row) => (
                    <li key={row.label} className={row.on ? undefined : styles.off}>
                      <span className={styles.mark} aria-hidden="true">{row.on ? "✓" : "—"}</span>
                      <span>
                        {row.label}
                        {row.on && row.note ? <small className={styles.featureNote}> {row.note}</small> : null}
                      </span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <span className={`${styles.cta} ${styles.ctaMuted}`}>Your current plan</span>
                ) : user && !canUpgrade ? (
                  <span className={`${styles.cta} ${styles.ctaMuted}`}>Included in your current or higher tier</span>
                ) : (
                  <ProductLinks tierKey={tierKey} compact />
                )}
              </article>
            );
          })}
        </div>

        {!user && (
          <p className={styles.signIn}>
            Already a member? <Link href="/login">Sign in</Link> to see your current plan.
          </p>
        )}

        <p className={styles.foot}>
          Membership purchases are completed securely on the Secret Yarnery storefront and
          applied to your account through the Shopify order integration. Lounge availability
          can still depend on a room&apos;s schedule and participant limit. Moving In annual
          checkout opens the storefront membership page so you can select the annual option.
        </p>
      </div>
    </main>
  );
}
