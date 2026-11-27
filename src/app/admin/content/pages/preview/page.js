import Link from "next/link";
import { redirect } from "next/navigation";
import LandingNav from "@/components/LandingNav";
import PageBlocks from "@/components/PageBlocks";
import { canModerate, getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { fallbackBlocksFor, isPageSlug, PAGE_SLUGS } from "@/lib/page-blocks";
import { getPreviewPageBlocks } from "@/lib/server/site-pages";
import { logError } from "@/lib/server/log";
import styles from "@/app/about/about.module.css";
import adminStyles from "@/app/admin/content/content.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function PublicPagePreview({ searchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const userDoc = await getUserDoc(user.uid);
  if (!canModerate(userDoc)) redirect("/dashboard");

  const { slug } = await searchParams;
  const pageSlug = isPageSlug(slug) ? slug : Object.keys(PAGE_SLUGS)[0];
  const spec = PAGE_SLUGS[pageSlug];
  let blocks = fallbackBlocksFor(pageSlug);
  try {
    const stored = await getPreviewPageBlocks(pageSlug);
    if (stored.length) blocks = stored;
  } catch (error) {
    logError("adminPage.preview_failed", { slug: pageSlug, message: error?.message });
  }

  return (
    <main className={styles.page}>
      <div className={adminStyles.trunc}>
        Draft preview of <strong>{spec.path}</strong> — not public.{" "}
        <Link href="/admin/content/pages">Back to editor</Link>
      </div>
      <LandingNav />
      <div className={styles.container}>
        <PageBlocks blocks={blocks} />
      </div>
    </main>
  );
}
