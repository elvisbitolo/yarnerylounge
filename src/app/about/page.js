import LandingNav from "@/components/LandingNav";
import PageBlocks from "@/components/PageBlocks";
import { publicMetadata } from "@/lib/seo";
import { fallbackBlocksFor } from "@/lib/page-blocks";
import { getPublicPageBlocks } from "@/lib/server/site-pages";
import { logError } from "@/lib/server/log";
import styles from "./about.module.css";

export const metadata = publicMetadata({
  title: "About",
  description:
    "Learn about Secret Yarnery — a paid membership community for live video lounges, courses, events and real conversations.",
  path: "/about",
});

export const dynamic = "force-dynamic";

export default async function AboutPage() {
  let blocks = fallbackBlocksFor("about");
  try {
    const published = await getPublicPageBlocks("about");
    if (published.length) blocks = published;
  } catch (error) {
    logError("about.page.blocks_failed", { message: error?.message });
  }

  return (
    <main className={styles.page}>
      <LandingNav />
      <div className={styles.container}>
        <PageBlocks blocks={blocks} />
      </div>
    </main>
  );
}
