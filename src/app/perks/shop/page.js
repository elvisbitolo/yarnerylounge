import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { SHOPIFY_UPGRADE_URL } from "@/lib/server/shopify";
import { getPerkTier, perkTierAtLeast, SHOP_DISCOUNT } from "@/lib/server/perks";
import Nav from "@/components/Nav";
import PerkLocked from "@/components/perks/PerkLocked";
import CopyCode from "@/components/perks/CopyCode";
import styles from "../perks.module.css";

export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const t = await getTranslations("perks.shop");
  const tNav = await getTranslations("nav");

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const userDoc = await getUserDoc(user.uid);

  const perkTier = await getPerkTier(user.uid);
  const unlocked = perkTierAtLeast(perkTier, "plus");

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
              <span className={styles.monthTag}>{t("discountTag", { percent: SHOP_DISCOUNT.percent })}</span>
            </div>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>{t("codeLabel")}</h2>
              <CopyCode code={SHOP_DISCOUNT.code} />
              <p className={styles.textBlock}>{t("howToUse")}</p>
              <ul className={styles.list}>
                {[1, 2, 3].map((step) => (
                  <li key={step}>{t(`step.${step}`)}</li>
                ))}
              </ul>
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>{t("noteTitle")}</h2>
              <p className={styles.textBlock}>{t("noteBody")}</p>
            </section>
          </>
        )}
      </div>
    </Nav>
  );
}