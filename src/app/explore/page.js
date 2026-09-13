import Link from "next/link";
import Image from "next/image";
import { getExploreData } from "@/lib/server/explore";
import styles from "./explore.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Explore — Secret Yarnery",
  description:
    "A preview of the Secret Yarnery community: live lounges, events, courses and spaces. Join to take part.",
};

function formatTime(millis) {
  return new Date(millis).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function ExplorePage() {
  const data = await getExploreData();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          <Image src="/brand/secretyarnery-logo.webp" alt="Secret Yarnery" width={90} height={28} className={styles.brandLogo} priority />
        </Link>
        <nav className={styles.headerLinks}>
          <Link className={styles.headerLink} href="/login">Log in</Link>
          <Link className={styles.cta} href="/signup">Join the community</Link>
        </nav>
      </header>

      <div className={styles.hero}>
        <h1 className={styles.title}>Explore the community</h1>
        <p className={styles.subtitle}>
          A glimpse of what&apos;s happening inside Secret Yarnery. Join to take part in live lounges,
          events, courses and spaces.
        </p>
      </div>

      <div className={styles.container}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Live lounges</h2>
            {data.rooms.length > 0 && (
              <Link className={styles.sectionLink} href="/rooms">See lounges</Link>
            )}
          </div>
          {data.rooms.length === 0 ? (
            <p className={styles.empty}>No lounges previewing right now.</p>
          ) : (
            <div className={styles.grid}>
              {data.rooms.map((room) => (
                <Link key={room.id} className={styles.card} href="/rooms">
                  <span className={styles.cardBadge}>{room.kind === "broadcast" ? "Broadcast" : "Live"}</span>
                  <h3 className={styles.cardName}>{room.name}</h3>
                  <p className={styles.cardDesc}>{room.description}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Upcoming events</h2>
            {data.events.length > 0 && (
              <Link className={styles.sectionLink} href="/events">See events</Link>
            )}
          </div>
          {data.events.length === 0 ? (
            <p className={styles.empty}>No upcoming events previewing right now.</p>
          ) : (
            <div className={styles.grid}>
              {data.events.map((event) => (
                <Link key={event.id} className={styles.card} href="/events">
                  <span className={styles.cardMeta}>{formatTime(event.startTime)}</span>
                  <h3 className={styles.cardName}>{event.title}</h3>
                  <p className={styles.cardDesc}>{event.description}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Courses</h2>
            {data.courses.length > 0 && (
              <Link className={styles.sectionLink} href="/courses">See courses</Link>
            )}
          </div>
          {data.courses.length === 0 ? (
            <p className={styles.empty}>No courses previewing right now.</p>
          ) : (
            <div className={styles.grid}>
              {data.courses.map((course) => (
                <Link key={course.id} className={styles.card} href="/courses">
                  <h3 className={styles.cardName}>{course.title}</h3>
                  <p className={styles.cardDesc}>{course.description}</p>
                  {course.purchasePriceCents > 0 && (
                    <span className={styles.cardMeta}>
                      ${(course.purchasePriceCents / 100).toFixed(2)}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Spaces</h2>
            {data.spaces.length > 0 && (
              <Link className={styles.sectionLink} href="/spaces">See spaces</Link>
            )}
          </div>
          {data.spaces.length === 0 ? (
            <p className={styles.empty}>No spaces previewing right now.</p>
          ) : (
            <div className={styles.grid}>
              {data.spaces.map((space) => (
                <Link key={space.id} className={styles.card} href="/spaces">
                  <h3 className={styles.cardName}>{space.name}</h3>
                  <p className={styles.cardDesc}>{space.description}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className={styles.join}>
          <h2 className={styles.joinTitle}>Ready to get involved?</h2>
          <Link className={styles.joinCta} href="/signup">Join Secret Yarnery</Link>
        </div>
      </div>
    </main>
  );
}
