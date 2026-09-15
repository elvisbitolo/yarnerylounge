import { redirect } from "next/navigation";
import { FileDown, FolderDown } from "lucide-react";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { PRINTABLES } from "@/lib/printables";
import Nav from "@/components/Nav";
import styles from "./resources.module.css";

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  return (
    <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Resources</h1>
          <span className={styles.badge}>
            <FolderDown size={12} />
            Printable files
          </span>
        </header>
        <p className={styles.subtitle}>
          Download, print, and keep by your side — stitch charts, pattern sheets, planners and more, ready for your next
          project.
        </p>

        <div className={styles.grid}>
          {PRINTABLES.length === 0 ? (
            <div className={styles.comingSoon}>
              <div className={styles.comingSoonTitle}>Printables are on the way</div>
              <p className={styles.comingSoonText}>
                The first printable patterns and planners are being prepared. Check back soon to download them.
              </p>
              <ul className={styles.categoryList}>
                <li className={styles.categoryItem}>Stitch &amp; symbol charts</li>
                <li className={styles.categoryItem}>Printable patterns</li>
                <li className={styles.categoryItem}>Project planners &amp; trackers</li>
                <li className={styles.categoryItem}>Gift tags &amp; labels</li>
              </ul>
            </div>
          ) : (
            PRINTABLES.map((item) => (
              <a
                key={item.slug}
                href={item.file}
                download
                target="_blank"
                rel="noopener noreferrer"
                className={styles.card}
              >
                <span className={styles.cardIcon}>
                  <FileDown size={22} />
                </span>
                <h2 className={styles.cardTitle}>{item.title}</h2>
                <p className={styles.cardDesc}>{item.description}</p>
                <div className={styles.cardMetaRow}>
                  <span className={styles.cardMeta}>{item.sizeLabel}</span>
                  {item.pages ? <span className={styles.cardMeta}>{item.pages} pages</span> : null}
                  <span className={styles.cardCta}>Download →</span>
                </div>
              </a>
            ))
          )}
        </div>
      </div>
    </Nav>
  );
}