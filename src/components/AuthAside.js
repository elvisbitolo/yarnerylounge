import { useTranslations } from "next-intl";
import Image from "next/image";
import styles from "../app/auth.module.css";

// Replaces the photo column on auth pages with the professional Membership &
// Checkout FAQ panel. Uses native <details> so no JS state is needed.
const FAQ_KEYS = [
  { q: "faqWhyQ", a: "faqWhyA" },
  { q: "faqSwitchQ", a: "faqSwitchA" },
  { q: "faqPromoQ", a: "faqPromoA" },
  { q: "faqMovingQ", a: "faqMovingA" },
];

export default function AuthAside() {
  const t = useTranslations("auth");

  return (
    <aside className={styles.aside}>
      <div className={styles.asideBrand}>
        <Image
          src="/brand/secretyarnery-logo.webp"
          alt=""
          width={90}
          height={28}
          className={styles.brandLogo}
        />
        <span className={styles.asideBrandWord}>Secret Yarnery</span>
      </div>

      <h2 className={styles.asideTitle}>{t("asideTitle")}</h2>
      <p className={styles.asideSub}>{t("asideSub")}</p>

      <div className={styles.faqList}>
        {FAQ_KEYS.map((item) => (
          <details key={item.q} className={styles.faqItem}>
            <summary className={styles.faqQ}>{t(item.q)}</summary>
            <p className={styles.faqA}>{t(item.a)}</p>
          </details>
        ))}
      </div>

      <p className={styles.asideToS}>
        {t.rich("tosCheckbox", {
          terms: (chunks) => (
            <a className={styles.asideLink} href="/terms">
              {chunks}
            </a>
          ),
        })}
      </p>
    </aside>
  );
}