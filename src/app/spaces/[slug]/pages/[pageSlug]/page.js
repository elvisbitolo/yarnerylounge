import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getSpaceBySlug, isSpaceMember } from "@/lib/server/spaces";
import { getAccessSub } from "@/lib/server/subscription";
import { meetsAccessTier } from "@/lib/server/membership";
import { getPurchasedKeys } from "@/lib/server/purchases";
import { canAccessPaid } from "@/lib/server/purchases-core";
import { getPageBySlug } from "@/lib/server/pages";
import BackButton from "@/components/BackButton";
import PageContent from "./PageContent";
import styles from "../page.module.css";

export const dynamic = "force-dynamic";

export default async function SpacePageDetail({ params }) {
  const { slug, pageSlug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);
  const space = await getSpaceBySlug(slug);

  if (!space || space.status !== "active") {
    return (
        <main className={styles.page}>
          <div className={styles.container}>
            <h1 className={styles.notFound}>Space not found</h1>
            <Link className={styles.link} href="/spaces">Back to spaces</Link>
          </div>
        </main>
    );
  }

  const isOwner = userDoc?.role === "owner";
  const membership = await isSpaceMember(space.id, user.uid);
  const isMember = !!membership;
  const [purchasedKeys, accessSub] = await Promise.all([
    getPurchasedKeys(user.uid),
    getAccessSub(user.uid),
  ]);
  const paidUnlocked = canAccessPaid("space", space, purchasedKeys);
  const tierUnlocked = space.requiredTier !== "premium" || meetsAccessTier(userDoc, accessSub, "moving-in");

  const baseView =
    isMember ||
    space.access === "public" ||
    (space.access !== "invite" && space.publicPreview);
  const canView = isOwner || (baseView && paidUnlocked && tierUnlocked);

  if (!canView) {
    return (
        <main className={styles.page}>
          <div className={styles.container}>
            <h1 className={styles.notFound}>Not available</h1>
            <p className={styles.subtitle}>Join or unlock this space to view this page.</p>
            <Link className={styles.link} href={`/spaces/${space.slug}`}>Back to space</Link>
          </div>
        </main>
    );
  }

  const page = await getPageBySlug(space.id, pageSlug);

  if (!page) {
    return (
        <main className={styles.page}>
          <div className={styles.container}>
            <h1 className={styles.notFound}>Page not found</h1>
            <Link className={styles.link} href={`/spaces/${space.slug}/pages`}>
              Back to pages
            </Link>
          </div>
        </main>
    );
  }

  if (page.visibility === "members" && !isMember && !isOwner) {
    return (
        <main className={styles.page}>
          <div className={styles.container}>
            <h1 className={styles.notFound}>Members only</h1>
            <p className={styles.subtitle}>Join this space to view this page.</p>
            <Link className={styles.link} href={`/spaces/${space.slug}`}>Back to space</Link>
          </div>
        </main>
    );
  }

  return (
      <main className={styles.page}>
        <div className={styles.detailContainer}>
          <BackButton fallback={`/spaces/${space.slug}/pages`} label="All pages" />
          <p className={styles.breadcrumb}>
            <Link className={styles.link} href="/spaces">Spaces</Link>
            <span className={styles.breadcrumbSep}>/</span>
            <Link className={styles.link} href={`/spaces/${space.slug}`}>{space.name}</Link>
            <span className={styles.breadcrumbSep}>/</span>
            <Link className={styles.link} href={`/spaces/${space.slug}/pages`}>Pages</Link>
            <span className={styles.breadcrumbSep}>/</span>
            <span>{page.title}</span>
          </p>

          <article className={styles.article}>
            <h1 className={styles.title}>{page.title}</h1>
            <div className={styles.meta}>
              <span>{page.visibility === "members" ? "Members only" : "Public"}</span>
              {page.createdAt && (
                <span>
                  {new Date(page.createdAt).toLocaleDateString([], {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}
            </div>
            <PageContent content={page.content} />
          </article>
        </div>
      </main>
  );
}
