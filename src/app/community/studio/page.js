import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { isStudioAdmin, listStudioVideos, signStudioPosterUrls } from "@/lib/server/studio";
import { serializeStudioVideo } from "@/lib/server/studio-core";
import { logError } from "@/lib/server/log";
import StudioLibrary from "./StudioLibrary";
import styles from "./studio.module.css";

// The catalogue changes whenever an admin publishes, so nothing here is static.
export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const userDoc = await getUserDoc(user.uid);

  let videos = [];
  let loadError = null;
  try {
    const rows = await listStudioVideos();
    // Sign every cover in one Storage call, then attach it by video id.
    const posters = await signStudioPosterUrls(rows);
    videos = rows.map((row) => serializeStudioVideo(row, posters[row.id] || null));
  } catch (error) {
    // An empty Studio and a broken query look identical otherwise; a silent
    // empty state would be misread as "nothing published yet".
    logError("studio.page.load_failed", { message: error?.message, stack: error?.stack });
    loadError = error?.message || "Failed to load Studio videos";
  }

  const canUpload = isStudioAdmin(user.email);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <Link href="/community" className={styles.back}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Community
        </Link>
        <p className={styles.eyebrow}>The Secret Yarnery</p>
        <h1 className={styles.title}>Studio</h1>
        <p className={styles.subtitle}>
          Talks, tutorials and stitch-alongs from the founders — watch the latest from the
          studio, whenever and wherever you are.
        </p>
      </header>

      <StudioLibrary
        videos={videos}
        loadError={loadError}
        canUpload={canUpload}
        currentUserLabel={userDoc?.name || user.name || ""}
      />
    </div>
  );
}
