import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import {
  getRecordingsStorageUsage,
  listRecordings,
  signThumbnailUrls,
} from "@/lib/server/recordings";
import { serializeRecording } from "@/lib/server/recordings-core";
import { logError } from "@/lib/server/log";
import RecordingsLibrary from "./RecordingsLibrary";

// Recordings arrive on their own schedule (a JaaS webhook), so nothing here
// can be cached at build time.
export const dynamic = "force-dynamic";

export default async function RecordingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const userDoc = await getUserDoc(user.uid);

  let recordings = [];
  let loadError = null;
  try {
    // includeUnready so pending/processing/failed cards render on first paint
    // and the library's auto-refresh poll arms; without it a still-pulling
    // recording is invisible and only appears after a manual reload.
    const rows = await listRecordings({ limit: 60, includeUnready: true });
    // Sign every poster frame in one Storage call, then attach it by row id.
    const thumbUrls = await signThumbnailUrls(rows);
    recordings = rows.map((row) => ({
      ...serializeRecording(row),
      thumbnailUrl: thumbUrls[row.id] || null,
    }));
  } catch (error) {
    // An empty library and a broken query look identical otherwise, and a
    // silent empty state would be misread as "nothing has been recorded yet".
    // Log it: the UI intentionally shows a generic message, so the log is the
    // only place the real cause is visible.
    logError("recordings.page.load_failed", { message: error?.message, stack: error?.stack });
    loadError = error?.message || "Failed to load recordings";
  }

  // The storage bar is informational: a failure here must not blank the page.
  let storage = null;
  try {
    storage = await getRecordingsStorageUsage();
  } catch (error) {
    logError("recordings.page.storage_failed", { message: error?.message });
  }

  return (
      <div className="recordings-page" style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 20px 64px" }}>
        <RecordingsLibrary
          recordings={recordings}
          loadError={loadError}
          canDelete={userDoc?.role === "owner"}
          currentUserId={user.uid}
          storage={storage}
        />
      </div>
  );
}
