import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { SHOPIFY_UPGRADE_URL } from "@/lib/server/shopify";
import { getPerkTier, perkTierAtLeast, listMembersOnlySessions } from "@/lib/server/perks";
import Nav from "@/components/Nav";
import PerkLocked from "@/components/perks/PerkLocked";
import styles from "../perks.module.css";

export const dynamic = "force-dynamic";

function formatSessionTime(ms) {
  const date = new Date(ms);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function SessionsPage() {
  const t = await getTranslations("perks.sessions");
  const tNav = await getTranslations("nav");

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const userDoc = await getUserDoc(user.uid);

  const perkTier = await getPerkTier(user.uid);
  const unlocked = perkTierAtLeast(perkTier, "plus");
  const sessions = await listMembersOnlySessions(user.uid);

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
            </div>

            {sessions.length === 0 ? (
              <section className={styles.card}>
                <p className={styles.textBlock}>{t("empty")}</p>
                <div className={styles.downloadRow}>
                  <Link className={styles.downloadBtn} href="/events">
                    {t("browseEvents")}
                  </Link>
                </div>
              </section>
            ) : (
              <ul className={styles.sessionsList}>
                {sessions.map((session) => (
                  <li key={session.id}>
                    <Link className={styles.sessionItem} href={session.href}>
                      <div>
                        <div className={styles.sessionDate}>{formatSessionTime(session.startTime)}</div>
                        <div className={styles.sessionTitle}>{session.title}</div>
                        {session.description && <div className={styles.sessionDesc}>{session.description}</div>}
                      </div>
                      <span className={styles.sessionCta}>
                        <span className={styles.downloadBtn}>{t("rsvp")}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Nav>
  );
}