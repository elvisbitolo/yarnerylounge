import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { listGroups } from "@/lib/server/groups";
import { listRooms } from "@/lib/server/rooms";
import Nav from "@/components/Nav";
import styles from "./community.module.css";

export const dynamic = "force-dynamic";

const SECTIONS = [
  {
    href: "/members",
    title: "Members",
    description: "The full registry of hookers, crafters and stitch-alongers — spot someone you know in the canvas and see who's like you.",
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c.8-3.4 3.4-5 6.5-5s5.7 1.6 6.5 5" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M17.5 15c2.4.3 4 1.7 4.5 4" />
      </svg>
    ),
  },
  {
    href: "/neighbourhoods",
    title: "Neighbourhoods",
    description: "Blanket Guild, the WIP Jail, Caffeine & Crochet, the Garment Glam District — join a neighbourhood, its feed, forum and members.",
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 20c2 0 4-1.5 4.5-.5z" />
        <path d="M14 20c2 0 4-1.5 4.5-.5z" />
        <path d="M6 20l4-3M14 20l-2-4M4 15l2-6M10 13l3-5" />
      </svg>
    ),
  },
  {
    href: "/gallery",
    title: "Gallery",
    description: "Show off your latest project, finish that long-lost WIP, and cheer on your neighbours' yarn wins.",
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="13" y="3" width="8" height="8" rx="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" />
        <rect x="13" y="13" width="8" height="8" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/leaderboard",
    title: "Leaderboard",
    description: "Points, streaks and badges for showing up — see who's leading the lounge this week and earn your spot.",
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 3.5l2.2 3.4 1.4 4.1-1.4 4.1-2.2 3.4-1.4-1.3z" />
        <path d="M12 3.5v2.6M11.4 6.1h1.2M9.6 8.2v2.5M14.4 8.2v2.5" />
      </svg>
    ),
  },
];

export default async function CommunityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  let memberCount = 0;
  try {
    const prisma = getPrisma();
    if (prisma) {
      const users = await prisma.user.findMany({ take: 500, select: { name: true } });
      memberCount = users.filter((u) => u.name).length;
    }
  } catch {
    memberCount = 0;
  }

  let neighbourhoodCount = 0;
  try {
    const groups = await listGroups();
    neighbourhoodCount = groups.filter((g) => g.status === "active").length;
  } catch {
    neighbourhoodCount = 0;
  }

  let roomCount = 0;
  try {
    const rooms = await listRooms();
    roomCount = rooms.filter((room) => room.status === "active").length;
  } catch {
    roomCount = 0;
  }

  return (
    <Nav role={userDoc?.role}>
      <div className={styles.page}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>The Secret Yarnery Speakeasy</p>
          <h1 className={styles.title}>Community</h1>
          <p className={styles.subtitle}>
            Craft together, celebrate each other, and find your people — the neighbourhoods,
            the gallery, and the ones making it all happen live every day.
          </p>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statNumber}>{memberCount}</span>
              <span className={styles.statLabel}>Members</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statNumber}>{neighbourhoodCount}</span>
              <span className={styles.statLabel}>Neighbourhoods</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statNumber}>{roomCount}</span>
              <span className={styles.statLabel}>Live rooms</span>
            </div>
          </div>
        </header>

        <div className={styles.grid}>
          {SECTIONS.map((section, i) => (
            <Link key={section.href} href={section.href} className={`${styles.card} ${styles.cardTone}${(i % 4) + 1}`}>
              <span className={styles.cardIcon} aria-hidden="true">
                {section.icon}
              </span>
              <h2 className={styles.cardTitle}>{section.title}</h2>
              <p className={styles.cardDesc}>{section.description}</p>
              <span className={styles.cardCta}>
                Open {section.title}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h13M12 5v13" />
                </svg>
              </span>
            </Link>
          ))}
        </div>

        <section className={styles.featured}>
          <div>
            <h2 className={styles.featuredTitle}>The Daily Blind Date</h2>
            <p className={styles.featuredDesc}>
              One curated member profile every day — match by fibre, craft, hobby, and
              timezone. Find your next crochet buddy in the neighbourhoods.
            </p>
          </div>
          <Link className={styles.featuredCta} href="/members">
            Find your match
          </Link>
        </section>
      </div>
    </Nav>
  );
}