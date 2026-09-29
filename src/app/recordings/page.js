import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { listRecordings } from "@/lib/server/recordings";
import { serializeRecording } from "@/lib/server/recordings-core";
import { logError } from "@/lib/server/log";
import Nav from "@/components/Nav";
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
    const rows = await listRecordings({ limit: 60 });
    recordings = rows.map(serializeRecording);
  } catch (error) {
    // An empty library and a broken query look identical otherwise, and a
    // silent empty state would be misread as "nothing has been recorded yet".
    // Log it: the UI intentionally shows a generic message, so the log is the
    // only place the real cause is visible.
    logError("recordings.page.load_failed", { message: error?.message, stack: error?.stack });
    loadError = error?.message || "Failed to load recordings";
  }

  return (
    <Nav role={userDoc?.role}>
      <div className="recordings-page" style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 20px 64px" }}>
        <RecordingsLibrary
          recordings={recordings}
          loadError={loadError}
          canDelete={userDoc?.role === "owner"}
        />
      </div>
    </Nav>
  );
}
