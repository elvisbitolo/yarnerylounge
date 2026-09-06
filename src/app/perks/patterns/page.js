import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { SHOPIFY_UPGRADE_URL } from "@/lib/server/shopify";
import { getPerkTier, perkTierAtLeast, getMonthlyPattern } from "@/lib/server/perks";
import Nav from "@/components/Nav";
import PerkLocked from "@/components/perks/PerkLocked";
import styles from "../perks.module.css";

export const dynamic = "force-dynamic";

export default async function PatternsPage() {
  const t = await getTranslations("perks.patterns");
  const tNav = await getTranslations("nav");

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const userDoc = await getUserDoc(user.uid);

  const perkTier = await getPerkTier(user.uid);
  const unlocked = perkTierAtLeast(perkTier, "plus");
  const pattern = getMonthlyPattern();

  return (
    <Nav role={userDoc?.role}>
      <div className={styles.page}>
        <nav className={styles.breadcrumb}>
          <Link href="/dashboard">{tNav("dashboard")}</Link>
          <span aria-hidden="true">/</span>
          <span>{t("title")}</span>
        </nav>

        {!unlocked ? (
          <PerkLocked
            title={t("lockedTitle")}
            body={t("lockedBody")}
            ctaLabel={t("upgrade")}
            ctaHref={SHOPIFY_UPGRADE_URL}
          />
        ) : (
          <>
            <div className={styles.hero}>
              <h1 className={styles.heroTitle}>{t("title")}</h1>
              <p className={styles.heroSub}>{t("subtitle")}</p>
              <span className={styles.monthTag}>{pattern.month}</span>
            </div>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>{pattern.title}</h2>
              <div className={styles.metaGrid}>
                <div className={styles.metaField}>
                  <div className={styles.metaLabel}>{t("fieldSkill")}</div>
                  <div className={styles.metaValue}>{pattern.skill}</div>
                </div>
                <div className={styles.metaField}>
                  <div className={styles.metaLabel}>{t("fieldHook")}</div>
                  <div className={styles.metaValue}>{pattern.hook}</div>
                </div>
                <div className={styles.metaField}>
                  <div className={styles.metaLabel}>{t("fieldYarn")}</div>
                  <div className={styles.metaValue}>{pattern.yarn}</div>
                </div>
                <div className={styles.metaField}>
                  <div className={styles.metaLabel}>{t("fieldSize")}</div>
                  <div className={styles.metaValue}>{pattern.finishedSize}</div>
                </div>
              </div>
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>{t("sectionDescription")}</h2>
              <p className={styles.textBlock}>{pattern.description}</p>
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>{t("sectionMaterials")}</h2>
              <ul className={styles.list}>
                {pattern.materials.map((material) => (
                  <li key={material}>{material}</li>
                ))}
              </ul>
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>{t("sectionInstructions")}</h2>
              <ol className={styles.steps}>
                {pattern.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>{t("sectionNotes")}</h2>
              <ul className={styles.list}>
                {pattern.tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
              <div className={styles.downloadRow}>
                <Link className={styles.downloadBtn} href="/api/perks/pattern/download">
                  {t("download")}
                </Link>
                <span className={styles.downloadHint}>{t("downloadHint")}</span>
              </div>
            </section>
          </>
        )}
      </div>
    </Nav>
  );
}