import Image from "next/image";
import styles from "./LegalFooter.module.css";

const PRIVACY_URL = "https://secretyarnery.com/pages/privacy-policy";

export default function LegalFooter() {
  return (
    <footer className={styles.footer}>
      <a className={styles.brand} href="/login">
        <Image src="/brand/secretyarnery-logo.webp" alt="" width={90} height={28} className={styles.brandLogo} />
        <span className={styles.brandWord}>Secret Yarnery</span>
      </a>
      <nav className={styles.links} aria-label="Legal">
        <a className={styles.link} href="/terms">Terms of Service</a>
        <a className={styles.link} href="/terms">Zero-Tolerance Policy</a>
        <a className={styles.link} href={PRIVACY_URL} target="_blank" rel="noreferrer">Privacy Policy</a>
        <a className={styles.link} href="mailto:christa@secretyarnery.com">Contact</a>
      </nav>
    </footer>
  );
}