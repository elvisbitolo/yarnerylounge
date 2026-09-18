import Image from "next/image";
import Link from "next/link";
import styles from "./terms.module.css";

export const metadata = {
  title: "Terms of Service — Christa's Secret Swipe Speakeasy",
  description:
    "The official Terms of Service for Christa's Secret Speakeasy, covering the Zero-Tolerance Policy, acceptable use, host responsibilities, enforcement, and platform rights.",
};

const LANDING_URL =
  process.env.NEXT_PUBLIC_SHOPIFY_PRICING_URL || "https://secretyarnery.com/pages/speakeasy";

const SECTIONS = [
  {
    heading: "No Self-Promotion, Advertising, or Selling",
    body:
      "This community is a sanctuary for connection and crafting, not a marketplace or billboard. What is banned: you may not sell patterns, finished objects, yarn, courses, or services; you may not post affiliate links, link to your own commercial shops (Etsy, Shopify, etc.), or promote external Facebook groups, Discord servers, or subscription platforms. What is allowed: sharing your personal, non-commercial works-in-progress (WIPs) to celebrate your progress with the group. Penalty: Immediate lifetime ban on the first offense.",
  },
  {
    heading: "Zero Tolerance for Bullying, Harassment, or Negativity",
    body:
      "We are dedicated to a welcoming and supportive environment. What is banned: any form of bullying, hate speech, body shaming, racism, sexism, or personal attacks will not be tolerated. This includes passive-aggressive comments, criticizing another member's skill level, or bringing toxic drama into the live video lounges and chat boards. Live Lounge Safety: uninvited criticism or policing of other members while inside live video streams is strictly prohibited. Penalty: Immediate lifetime ban on the first offense.",
  },
  {
    heading: "“Moving In” Host Responsibilities & Abuse of Power",
    body:
      "Members of the Moving In tier have the privilege to create and host their own live video rooms and sub-groups. With this power comes strict responsibility. Hosts must keep their rooms safe, welcoming, and on-topic. Hosts may never use their live rooms or sub-groups to promote products, run unapproved businesses, or exclude/harass other paying members. Christa and the Lounge administration reserve the right to shut down any member-created room or group at any time, for any reason.",
  },
  {
    heading: "Direct Enforcement: The Lifetime Ban & No-Refund Policy",
    body:
      "To keep the lounge crowded with the best people, we protect our culture fiercely. If the moderation team determines that you have violated these Terms of Service, your account will be deleted immediately. You will be banned for life. You will never be allowed to re-join the community under any email address or alias. Absolutely no refunds will be issued: by breaking the community contract, you forfeit any remaining time on your monthly or annual subscription fee.",
  },
  {
    heading: "Platform Rights & Changes",
    body:
      "Christa's Lounge reserves the right to modify these rules or adjust subscription structures at any time to ensure the safety and longevity of the community. Continued use of the platform after changes are posted constitutes acceptance of the new terms.",
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
        <p className={styles.updated}>Effective date: September 18, 2026 · Last updated: September 2026</p>

        <div className={styles.intro}>
          <p>
            Welcome to the Lounge! By subscribing to or entering Christa&apos;s
            Secret Speakeasy — including the Flirting, Hooking Up, and Moving In
            tiers — you explicitly agree to follow these Terms of Service.
          </p>
          <p>
            Our goal is to maintain a fun, high-energy, and welcoming environment
            for all members. To protect this space, we enforce a strict
            Zero-Tolerance Policy. Violation of any of the core rules below will
            result in an immediate, permanent lifetime ban with absolutely no
            refunds.
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
          <a className={styles.link} href="mailto:christa@secretyarnery.com">
            christa@secretyarnery.com
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