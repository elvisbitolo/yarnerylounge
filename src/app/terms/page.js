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
    heading: "Membership Tiers & Billing",
    body:
      "The Lounge offers three membership tiers: Flirting (free), Hooking Up, and Moving In. Paid plans are billed monthly or annually on the cycle selected at checkout and renew automatically on that plan until cancelled. You may upgrade, downgrade, or cancel your subscription at any time from Account → Membership. If a payment cannot be collected, access pauses automatically until the next successful payment.",
  },
  {
    heading: "Our Community Standard: The Zero-Tolerance Policy",
    body:
      "Christa's Secret Yarnery Lounge is built to be a fun, high-energy, and welcoming space for every member. To protect that space, we enforce a strict Zero-Tolerance Policy: the rules in Sections 3 and 4 carry an immediate, permanent lifetime ban with no refunds. Membership is a privilege, not a right, and every member — regardless of tier — is held to the same standard of conduct.",
  },
  {
    heading: "No Self-Promotion, Advertising, or Selling",
    body:
      "This community is a sanctuary for connection and crafting — not a marketplace or a billboard. What is prohibited: You may not sell patterns, finished objects, yarn, courses, or services; you may not post affiliate links or links to your own commercial shops (on Etsy, Shopify, or elsewhere); and you may not promote external Facebook groups, Discord servers, or subscription platforms. What is welcome: Sharing your personal, non-commercial works-in-progress to celebrate your progress with the community. Penalty: Immediate lifetime ban on the first offence.",
  },
  {
    heading: "Zero Tolerance for Bullying, Harassment, or Negativity",
    body:
      "We are committed to a supportive environment in every corner of the Lounge — the live video rooms, chat, and community boards alike. What is prohibited: Bullying, hate speech, body shaming, racism, sexism, personal attacks, passive-aggressive comments, and criticism of another member's skill level. Uninvited criticism or policing of other members inside live video streams is likewise strictly prohibited. Penalty: Immediate lifetime ban on the first offence.",
  },
  {
    heading: "“Moving In” Host Responsibilities",
    body:
      "Moving In members have the privilege of creating and hosting live video rooms and sub-groups. With that privilege comes responsibility: hosts must keep their rooms safe, welcoming, and on-topic; they may never use their rooms or sub-groups to promote products, run unapproved businesses, or exclude or harass other paying members. Christa and the Lounge administration reserve the right to shut down any member-created room or group at any time, for any reason.",
  },
  {
    heading: "Enforcement: Lifetime Ban & No-Refund Policy",
    body:
      "We protect our culture fiercely. If the moderation team determines that you have violated these Terms, your account will be deleted immediately. You will be banned for life and will not be allowed to re-join the community under any email address or alias. No refunds will be issued: by breaking the community contract, you forfeit any remaining time on your monthly or annual subscription.",
  },
  {
    heading: "Platform Rights & Changes",
    body:
      "Christa's Lounge reserves the right to modify these Terms or adjust subscription structures at any time to ensure the safety and longevity of the community. Material changes will be announced inside the Lounge. Continued use of the platform after changes are posted constitutes acceptance of the new Terms.",
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
            Welcome to Christa&apos;s Secret Yarnery Lounge — a private, members-only
            sanctuary built for crafters. These Terms of Service (“Terms”) govern
            your access to the Lounge and everything in it, including the
            Flirting, Hooking Up, and Moving In membership tiers, the 24/7 live
            video lounges, community groups, the matching calendar, courses, and
            events. By creating an account, ticking the “I agree” box, or
            purchasing a membership, you confirm that you have read, understood,
            and agree to be bound by these Terms.
          </p>
          <p className={styles.confirmation}>
            These Terms apply to all members — the free Flirting tier included —
            from the moment you enter the Lounge. If you do not agree, please do
            not create an account or use the platform.
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