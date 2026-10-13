import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AUTH_COOKIE } from "@/lib/server/auth";
import { getExploreData } from "@/lib/server/explore";
import {
  publicMetadata,
  eventJsonLd,
  courseJsonLd,
  faqJsonLd,
  breadcrumbJsonLd,
  SITE_NAME,
} from "@/lib/seo";
import LandingNav from "@/components/LandingNav";
import JsonLd from "@/components/JsonLd";
import styles from "./landing.module.css";

export const dynamic = "force-dynamic";

export const metadata = publicMetadata({
  title: "Secret Yarnery — Live lounges, courses & real conversations",
  description:
    "Meet, learn and make together in Secret Yarnery — live video lounges, courses, events, groups and real conversations. Start free, cancel anytime.",
  path: "/",
  absolute: true,
});

function formatEventTime(millis) {
  try {
    return new Date(millis).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default async function Home() {
  // A visitor with a session cookie is a returning member: hand them to the
  // reentry route, which refreshes/expires the session and drops them on the
  // dashboard. Everyone else (including every crawler) gets the public landing
  // page as a real 200 instead of the old redirect-to-signup.
  const cookieStore = await cookies();
  if (cookieStore.get(AUTH_COOKIE)?.value) redirect("/api/auth/reentry");

  const locale = cookieStore.get("NEXT_LOCALE")?.value || "en";
  const messages = (await import(`../../messages/${locale}.json`)).default;
  const t = messages.landing;

  const data = await getExploreData(6);
  const faqs = [1, 2, 3, 4].map((n) => ({ question: t[`faq${n}Q`], answer: t[`faq${n}A`] }));

  const structuredData = [
    breadcrumbJsonLd([{ name: "Home", path: "/" }]),
    faqJsonLd(faqs),
    ...data.events.map(eventJsonLd),
    ...data.courses.map(courseJsonLd),
  ];

  return (
    <main className={styles.page}>
      <JsonLd data={structuredData} />
      <LandingNav />

      <section className={styles.hero}>
        <p className={styles.eyebrow}>{t.landingHeroEyebrow}</p>
        <h1 className={styles.heroTitle}>{t.landingHeroTitle}</h1>
        <p className={styles.heroSub}>{t.landingHeroSub}</p>
        <div className={styles.heroCtas}>
          <Link className={styles.primaryCta} href="/signup">
            {t.landingCtaStart}
          </Link>
          <Link className={styles.secondaryCta} href="/explore">
            {t.exploreCommunity}
          </Link>
        </div>
        <p className={styles.heroNote}>{t.freeTrial}</p>
      </section>

      <section className={styles.section} aria-labelledby="inside-title">
        <h2 id="inside-title" className={styles.sectionTitle}>
          {t.insideTitle}
        </h2>
        <p className={styles.sectionDesc}>{t.insideDesc}</p>
        <div className={styles.grid}>
          {[1, 2, 3, 4].map((n) => (
            <article key={n} className={styles.card}>
              <h3 className={styles.cardTitle}>{t[`inside${n}Title`]}</h3>
              <p className={styles.cardDesc}>{t[`inside${n}Desc`]}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="rooms-title">
        <h2 id="rooms-title" className={styles.sectionTitle}>
          {t.roomsSectionTitle}
        </h2>
        <p className={styles.sectionDesc}>{t.roomsSectionDesc}</p>
        <div className={styles.grid}>
          {[
            { name: t.roomHappy, tag: t.roomHappyTag },
            { name: t.roomLoFi, tag: t.roomLoFiTag },
            { name: t.roomVelvet, tag: t.roomVelvetTag },
            { name: t.roomSilent, tag: t.roomSilentTag },
          ].map((room) => (
            <article key={room.name} className={styles.roomCard}>
              <span className={styles.roomBadge}>{t.roomsOpen}</span>
              <h3 className={styles.cardTitle}>{room.name}</h3>
              <p className={styles.cardDesc}>{room.tag}</p>
            </article>
          ))}
        </div>
      </section>

      {(data.events.length > 0 || data.courses.length > 0) && (
        <section className={styles.section} aria-labelledby="live-title">
          <h2 id="live-title" className={styles.sectionTitle}>
            {t.neverMiss}
          </h2>
          <p className={styles.sectionDesc}>{t.neverMissDesc}</p>
          <div className={styles.grid}>
            {data.events.map((event) => (
              <article key={event.id} className={styles.card}>
                <span className={styles.cardMeta}>{formatEventTime(event.startTime)}</span>
                <h3 className={styles.cardTitle}>{event.title}</h3>
                <p className={styles.cardDesc}>{event.description}</p>
              </article>
            ))}
            {data.courses.map((course) => (
              <article key={course.id} className={styles.card}>
                <span className={styles.cardMeta}>{t.courses}</span>
                <h3 className={styles.cardTitle}>{course.title}</h3>
                <p className={styles.cardDesc}>{course.description}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className={styles.section} aria-labelledby="faq-title">
        <h2 id="faq-title" className={styles.sectionTitle}>
          {t.faqTitle}
        </h2>
        <div className={styles.faq}>
          {faqs.map((faq) => (
            <details key={faq.question} className={styles.faqItem}>
              <summary className={styles.faqQ}>{faq.question}</summary>
              <p className={styles.faqA}>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.finalCta} aria-labelledby="join-title">
        <h2 id="join-title" className={styles.finalTitle}>
          {t.moveTitle}
        </h2>
        <p className={styles.finalDesc}>{t.moveDesc}</p>
        <Link className={styles.primaryCta} href="/signup">
          {t.moveCta}
        </Link>
      </section>

      <footer className={styles.footer}>
        <p className={styles.footerTagline}>{t.footerTagline}</p>
        <nav className={styles.footerNav} aria-label="Footer">
          <Link href="/explore">{t.exploreCommunity}</Link>
          <Link href="/about">{t.about}</Link>
          <Link href="/guidelines">{t.communityGuidelines}</Link>
          <Link href="/privacy">{t.privacy}</Link>
          <Link href="/terms">{t.terms}</Link>
          <Link href="/login">{t.login}</Link>
          <Link href="/signup">{t.signup}</Link>
        </nav>
        <p className={styles.copyright}>
          © {new Date().getFullYear()} {SITE_NAME}
        </p>
      </footer>
    </main>
  );
}
