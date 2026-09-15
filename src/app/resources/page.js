import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { BookOpen, GraduationCap, ListChecks, MessageCircleQuestion } from "lucide-react";
import Nav from "@/components/Nav";
import styles from "./resources.module.css";

export const dynamic = "force-dynamic";

const RESOURCE_AREAS = [
  {
    href: "/articles",
    icon: BookOpen,
    title: "Tutorials & Patterns",
    description: "Step-by-step guides, patterns, and stories written by the community.",
    cta: "Browse articles",
  },
  {
    href: "/courses",
    icon: GraduationCap,
    title: "Courses",
    description: "Structured lessons with quizzes and certificates — learn at your own pace.",
    cta: "Explore courses",
  },
  {
    href: "/challenges",
    icon: ListChecks,
    title: "Crochet Alongs",
    description: "Join community-wide challenges and track your progress together.",
    cta: "See challenges",
  },
  {
    href: "/quizzes",
    icon: MessageCircleQuestion,
    title: "Community Q&A",
    description: "Ask the community for help and get answers from fellow crocheters.",
    cta: "Ask a question",
  },
];

export default async function ResourcesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  return (
    <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Resources</h1>
        </header>
        <p className={styles.subtitle}>
          Everything you need to grow your craft — tutorials, courses, challenges, and help from the community.
        </p>
        <div className={styles.grid}>
          {RESOURCE_AREAS.map((area) => {
            const Icon = area.icon;
            return (
              <Link key={area.href} href={area.href} className={styles.card}>
                <span className={styles.cardIcon}>
                  <Icon size={22} />
                </span>
                <h2 className={styles.cardTitle}>{area.title}</h2>
                <p className={styles.cardDesc}>{area.description}</p>
                <span className={styles.cardCta}>{area.cta} →</span>
              </Link>
            );
          })}
        </div>
      </div>
    </Nav>
  );
}