import Image from "next/image";
import Link from "next/link";
import styles from "../terms/terms.module.css";

export const metadata = {
  title: "Privacy Policy",
  description:
    "Learn what information Secret Yarnery collects, how it is used and shared, and how to make a privacy request.",
};

const LANDING_URL =
  process.env.NEXT_PUBLIC_SHOPIFY_PRICING_URL || "https://secretyarnery.com/pages/speakeasy";

const SECTIONS = [
  {
    heading: "Information we collect",
    body:
      "We collect information you provide when creating or managing an account, including your name, email address, username, profile photo, contact details, location, biography, craft interests, preferences, and other profile details you choose to add. We also process content you submit, such as posts, comments, messages, projects, photos, files, event responses, and profile or community activity. If you sign in with Google, our authentication provider receives the information Google makes available for sign-in, such as your name, email address, profile image, and account identifier.",
  },
  {
    heading: "How we use information",
    body:
      "We use information to provide and personalize the community, authenticate accounts, display member profiles and content, operate messaging, groups, events and live rooms, manage membership access and purchases, send account or community notifications, prevent abuse, enforce our Terms of Service, maintain security, and troubleshoot and improve the service. We use profile details such as country, interests, and craft preferences to support member discovery and matching. Location displays are approximate and based on profile information you provide; we do not use precise device location for the member map.",
  },
  {
    heading: "When information is visible to others",
    body:
      "Information and content you add to a member profile, post, comment, group, event, or conversation may be visible to other members or to the people participating in that feature. Your profile visibility settings affect who can see your profile. Do not post information or files you do not want other people in the community to see. Content shared in live rooms may be seen or heard by room participants.",
  },
  {
    heading: "Cookies, device and usage information",
    body:
      "The service uses necessary browser storage and cookies to keep you signed in, remember settings such as language, and support security and core features. We and our hosting/analytics providers may process technical information such as IP address, browser and device details, requests, and service performance or usage events to operate, secure, and understand the service. The app also uses browser storage for certain interface preferences and may request permission to send push notifications. You can manage browser storage and notification permissions in your browser settings.",
  },
  {
    heading: "How information is shared",
    body:
      "We share information with service providers that help us run the service, including providers for hosting and analytics, authentication and database services, file storage, payment or membership processing, email or push delivery, and live video rooms. These providers process information as needed to provide their services. When you choose Google sign-in, Google processes your sign-in under Google's own privacy terms. Membership purchases may take place through Shopify or another configured checkout provider and are also subject to that provider's policies. We may disclose information when reasonably necessary to protect users, investigate abuse, comply with law, or protect our rights. We do not sell personal information for money.",
  },
  {
    heading: "Live video, recordings and transcripts",
    body:
      "Live rooms use a third-party video service. Room participants may share audio, video, chat, and other information with one another. Some rooms or sessions may be recorded or transcribed when those features are enabled; when available, recording or transcription indicators and room controls should be used to inform participants. Please avoid sharing sensitive information in live rooms. The video provider may process technical and participation data under its own terms and privacy policy.",
  },
  {
    heading: "Retention and deletion",
    body:
      "We keep information for as long as needed to operate your account and provide the service, and for legitimate safety, security, dispute-resolution, and legal purposes. You may request account deletion by contacting us at the address below. Deletion removes or de-identifies information where practicable, but some records may remain for a limited period in backups, logs, or where retention is required or permitted by law. Public content already copied or saved by other members may not be removable from their copies.",
  },
  {
    heading: "Your choices and privacy requests",
    body:
      "You can review and update many profile details in your account settings, adjust browser notification permissions, and choose what you share with the community. Depending on where you live, you may have rights to request access to, correction of, deletion of, or a copy of your personal information, or to object to or restrict certain processing. Contact us to make a request. We may need to verify your identity before responding.",
  },
  {
    heading: "Security and international processing",
    body:
      "We use technical and organizational measures intended to protect information, but no internet service can guarantee absolute security. Our providers may process or store information in countries other than yours, where privacy laws may differ. Where required, we use appropriate safeguards for international transfers.",
  },
  {
    heading: "Children and changes to this policy",
    body:
      "The service is not intended for children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child has provided us information, contact us so we can review it. We may update this policy as the service changes. We will post the current version here and update its date; material changes may also be communicated through the service.",
  },
];

export default function PrivacyPage() {
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
            <Link className={styles.navLink} href="/terms">Terms of Service</Link>
            <Link className={styles.navLink} href="/login">Sign in</Link>
          </div>
        </nav>
      </div>
      <article className={styles.card}>
        <p className={styles.kicker}>Legal</p>
        <h1 className={styles.title}>Privacy Policy</h1>
        <p className={styles.updated}>Effective date: October 4, 2026 · Last updated: October 4, 2026</p>

        <div className={styles.intro}>
          <p>
            This Privacy Policy explains how Secret Yarnery and Christa&apos;s
            Secret Speakeasy (“we,” “us,” or “our”) collect, use, and share
            information when you use our website and community.
          </p>
          <p>
            By using the service, you acknowledge this policy. For questions or
            privacy requests, contact{" "}
            <a className={styles.link} href="mailto:christa@secretyarnery.com">
              christa@secretyarnery.com
            </a>.
          </p>
        </div>

        {SECTIONS.map((section, index) => (
          <section key={section.heading} className={styles.section}>
            <h2 className={styles.heading}>
              <span className={styles.number}>{String(index + 1).padStart(2, "0")}</span>
              {section.heading}
            </h2>
            <p className={styles.body}>{section.body}</p>
          </section>
        ))}

        <p className={styles.footer}>
          Read our <Link className={styles.link} href="/terms">Terms of Service</Link>.
        </p>
        <div className={styles.ctaBlock}>
          <Link className={styles.ctaButton} href="/signup">Create an account</Link>
          <a className={styles.ctaBack} href={LANDING_URL}>Back to the site</a>
        </div>
      </article>
    </main>
  );
}
