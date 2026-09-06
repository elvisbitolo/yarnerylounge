import Image from "next/image";
import Link from "next/link";
import styles from "./terms.module.css";

export const metadata = {
  title: "Terms of Service — Secret Yarnery",
  description:
    "The official Terms of Service for Secret Yarnery, covering membership plans, acceptable use, billing, and your rights as a member.",
};

const LANDING_URL =
  process.env.NEXT_PUBLIC_SHOPIFY_PRICING_URL || "https://secretyarnery.com/pages/speakeasy";

const SECTIONS = [
  {
    heading: "Acceptance of Terms",
    body:
      "By accessing or using Secret Yarnery (“the Lounge”), you agree to be bound by these Terms of Service. If you do not agree, please do not create an account or use the platform.",
  },
  {
    heading: "The Membership Plans",
    body:
      "The Lounge offers three membership plans: Flirting (free), Hooking Up ($7.95/month or $79.50/year), and Moving In ($17.95/month or $179.50/year). Plans renew automatically on the billing cycle you selected until cancelled.",
  },
  {
    heading: "Account Responsibilities",
    body:
      "You are responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account. If you suspect unauthorised use, notify us immediately.",
  },
  {
    heading: "Acceptable Use",
    body:
      "Treat fellow members with respect. You may not harass, impersonate, spam, post unlawful content, attempt to disrupt video rooms, or use the platform for any illegal purpose. We may suspend or terminate accounts that violate these rules.",
  },
  {
    heading: "Payments & Billing",
    body:
      "Payments are processed securely at checkout. You can switch plans or cancel at any time from Account → Membership. If a payment can't be collected, access pauses automatically until the next successful payment. Refunds are handled per our refund policy.",
  },
  {
    heading: "Intellectual Property",
    body:
      "Content you post remains yours. You grant the Lounge a licence to display it within the platform. All trademarks, brand assets, and software belong to Secret Yarnery.",
  },
  {
    heading: "No Guarantees",
    body:
      "The platform is provided “as is”. We don't guarantee uninterrupted availability and aren't liable for damage arising from your use of the Lounge or its live video rooms.",
  },
  {
    heading: "Changes to These Terms",
    body:
      "We may update these Terms from time to time. Material changes will be announced inside the Lounge. Continued use after changes means you accept them.",
  },
];

export default function TermsPage() {
  return (
    <main className={styles.wrap}>
      <div className={styles.header}>
        <nav className={styles.nav}>
          <a className={styles.brandLink} href={LANDING_URL}>
            <Image
              src="/brand/secretyarnery-logo.webp"
              alt=""
              width={90}
              height={28}
              className={styles.brandLogo}
            />
            <span className={styles.brandWord}>Secret Yarnery</span>
          </a>
          <div className={styles.navLinks}>
            <Link className={styles.navLink} href="/login">Sign in</Link>
            <Link className={styles.navLink} href="/signup">Create account</Link>
          </div>
        </nav>
      </div>
      <div className={styles.card}>
        <p className={styles.kicker}>Legal</p>
        <h1 className={styles.title}>Terms of Service</h1>
        <p className={styles.updated}>Effective date: September 1, 2026 · Last updated: September 2026</p>

        <div className={styles.intro}>
          <p>
            Welcome to Secret Yarnery. These Terms of Service (“Terms”) govern your access to and use
            of the Lounge, including membership plans, live video rooms, community groups, and the
            matching calendar. By creating an account, checking the “I agree” box, or using the
            platform, you confirm that you have read, understood, and agree to be bound by these Terms.
          </p>
          <p className={styles.confirmation}>
            Creating your account requires you to accept these Terms by ticking the checkbox on the
            sign-up form. If you do not agree, you may not access the platform.
          </p>
        </div>

        {SECTIONS.map((s, i) => (
          <section key={s.heading} className={styles.section}>
            <h2 className={styles.heading}>
              <span className={styles.number}>{String(i + 1).padStart(2, "0")}</span>
              {s.heading}
            </h2>
            <p className={styles.body}>{s.body}</p>
          </section>
        ))}

        <p className={styles.footer}>
          Questions about these Terms? Contact{" "}
          <a className={styles.link} href="mailto:hello@christa-patel.com">
            hello@christa-patel.com
          </a>
        </p>

        <div className={styles.ctaBlock}>
          <Link className={styles.ctaButton} href="/signup">I agree — create my account</Link>
          <a className={styles.ctaBack} href={LANDING_URL}>Back to the site</a>
        </div>
      </div>
    </main>
  );
}