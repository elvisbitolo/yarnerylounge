import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getSpaceBySlug, isSpaceMember } from "@/lib/server/spaces";
import { listPages } from "@/lib/server/pages";
import BackButton from "@/components/BackButton";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function SpacePagesPage({ params }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);
  const space = await getSpaceBySlug(slug);

  if (!space || space.status !== "active") {
    return (
        <main className={styles.page}>
          <div className={styles.container}>
            <h1 className={styles.title}>Space not found</h1>
            <p className={styles.subtitle}>This space is closed or doesn&apos;t exist.</p>
            <Link className={styles.link} href="/spaces">Back to spaces</Link>
          </div>
        </main>
    );
  }

  const isOwner = userDoc?.role === "owner";
  const membership = await isSpaceMember(space.id, user.uid);
  const isMember = !!membership;

  const canView =
    isMember ||
    isOwner ||
    space.access === "public" ||
    (space.access !== "invite" && space.publicPreview);

  if (!canView) {
    return (
        <main className={styles.page}>
          <div className={styles.container}>
            <h1 className={styles.title}>Not available</h1>
            <p className={styles.subtitle}>Join this space to browse its pages.</p>
            <Link className={styles.link} href={`/spaces/${space.slug}`}>Back to space</Link>
          </div>
        </main>
    );
  }

  const pages = (await listPages(space.id)).filter(
    (p) => p.visibility === "all" || isMember || isOwner
  );

  return (
      <main className={styles.page}>
        <div className={styles.container}>
          <BackButton fallback={`/spaces/${space.slug}`} label={space.name} />
          <p className={styles.breadcrumb}>
            <Link className={styles.link} href="/spaces">Spaces</Link>
            <span className={styles.breadcrumbSep}>/</span>
            <Link className={styles.link} href={`/spaces/${space.slug}`}>{space.name}</Link>
            <span className={styles.breadcrumbSep}>/</span>
            <span>Pages</span>
          </p>

          <div className={styles.spaceHeader}>
            <h1 className={styles.title}>Pages</h1>
            {pages.length > 0 && (
              <p className={styles.subtitle}>Guides, resources, and more from {space.name}.</p>
            )}
          </div>

          {pages.length === 0 ? (
            <p className={styles.empty}>No pages in this space yet.</p>
          ) : (
            <div className={styles.pageGrid}>
              {pages.map((page) => (
                <Link
                  key={page.id}
                  href={`/spaces/${space.slug}/pages/${page.slug}`}
                  className={styles.pageCard}
                >
                  <h3 className={styles.pageCardTitle}>{page.title}</h3>
                  <p className={styles.pageCardMeta}>
                    {page.visibility === "members" ? "Members only" : "Public"} ·{" "}
                    {page.updatedAt
                      ? new Date(page.updatedAt).toLocaleDateString([], {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "Recently"}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
  );
}
