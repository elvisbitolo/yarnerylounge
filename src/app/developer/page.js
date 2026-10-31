import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { listRecordings, getRecordingsStorageUsage } from "@/lib/server/recordings";
import styles from "./developer.module.css";

export const dynamic = "force-dynamic";

const DEVELOPER_EMAIL = "elvisbitolo11@gmail.com";

async function loadSystemSnapshot() {
  const snapshot = {
    database: "unknown",
    recordings: null,
    storage: null,
    checkedAt: new Date().toISOString(),
  };

  try {
    const prisma = getPrisma();
    if (!prisma) throw new Error("Database client unavailable");
    await prisma.$queryRaw`SELECT 1`;
    snapshot.database = "operational";
  } catch {
    snapshot.database = "needs attention";
  }

  try {
    const rows = await listRecordings({ limit: 60, includeUnready: true });
    snapshot.recordings = {
      visible: rows.length,
      processing: rows.filter((row) => ["pending", "processing", "pulling", "ingesting"].includes(String(row.status || "").toLowerCase())).length,
      failed: rows.filter((row) => String(row.status || "").toLowerCase() === "failed").length,
    };
  } catch {
    snapshot.recordings = { error: true };
  }

  try {
    snapshot.storage = await getRecordingsStorageUsage();
  } catch {
    snapshot.storage = { error: true };
  }

  try {
    const prisma = getPrisma();
    const rows = await prisma.auditLog.findMany({
      where: { action: { not: "jitsi.network.sample" }, metadata: { path: ["category"], not: null } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, actorId: true, actorName: true, action: true, targetId: true, metadata: true, createdAt: true },
    });
    snapshot.activityEvents = rows.map((row) => ({
      id: row.id,
      actorId: row.actorId,
      actorName: row.actorName || "Member",
      action: row.action,
      targetId: row.targetId,
      createdAt: row.createdAt,
      ...(row.metadata && typeof row.metadata === "object" ? row.metadata : {}),
    }));
  } catch {
    snapshot.activityEvents = null;
  }

  try {
    const prisma = getPrisma();
    const rows = await prisma.auditLog.findMany({
      where: { action: "jitsi.network.sample" },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, actorName: true, metadata: true, createdAt: true },
    });
    snapshot.networkSamples = rows.map((row) => ({
      id: row.id,
      actorName: row.actorName || "Member",
      createdAt: row.createdAt,
      ...(row.metadata && typeof row.metadata === "object" ? row.metadata : {}),
    }));
  } catch {
    snapshot.networkSamples = null;
  }

  return snapshot;
}

function Status({ value }) {
  const healthy = value === "operational";
  return <span className={healthy ? styles.statusGood : styles.statusWarn}>{value}</span>;
}

export default async function DeveloperPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (String(user.email || "").trim().toLowerCase() !== DEVELOPER_EMAIL) notFound();

  const snapshot = await loadSystemSnapshot();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Private engineering workspace</p>
          <h1 className={styles.title}>Developer control centre</h1>
          <p className={styles.subtitle}>Application operations, infrastructure checks and engineering shortcuts.</p>
        </div>
        <div className={styles.identity}>
          <span className={styles.identityDot} />
          <span>Developer access</span>
        </div>
      </header>

      <section className={styles.hero}>
        <div>
          <p className={styles.heroLabel}>Production workspace</p>
          <h2>Christa’s Speakeasy</h2>
          <p>Private to the authorized developer account. Member and owner workspaces remain separate.</p>
        </div>
        <div className={styles.heroMeta}>
          <span>Environment</span>
          <strong>Production</strong>
          <small>Snapshot checked {new Date(snapshot.checkedAt).toLocaleString()}</small>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div><p className={styles.eyebrow}>Live checks</p><h2>System health</h2></div>
          <span className={styles.muted}>Fetched on page load</span>
        </div>
        <div className={styles.metrics}>
          <article className={styles.metric}>
            <span>Database connection</span>
            <Status value={snapshot.database} />
            <small>Prisma connectivity probe</small>
          </article>
          <article className={styles.metric}>
            <span>Recordings visible</span>
            <strong>{snapshot.recordings?.error ? "Unavailable" : snapshot.recordings?.visible ?? "—"}</strong>
            <small>Latest active library records, max 60</small>
          </article>
          <article className={styles.metric}>
            <span>Processing</span>
            <strong>{snapshot.recordings?.error ? "—" : snapshot.recordings?.processing ?? "—"}</strong>
            <small>Pending or ingesting recordings</small>
          </article>
          <article className={styles.metric}>
            <span>Failed recordings</span>
            <strong>{snapshot.recordings?.error ? "—" : snapshot.recordings?.failed ?? "—"}</strong>
            <small>Requires investigation if non-zero</small>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div><p className={styles.eyebrow}>Member operations</p><h2>Activity & failure monitor</h2></div>
          <span className={styles.muted}>Latest 100 recorded events</span>
        </div>
        <div className={styles.networkPanel}>
          <p className={styles.networkIntro}>Membership payment and processing outcomes are recorded here alongside operational events explicitly instrumented by the application. Sensitive payment credentials and raw provider payloads are not stored.</p>
          {snapshot.activityEvents === null ? (
            <p className={styles.networkEmpty}>Activity diagnostics are currently unavailable.</p>
          ) : snapshot.activityEvents.length === 0 ? (
            <p className={styles.networkEmpty}>No activity events have been recorded yet.</p>
          ) : (
            <div className={styles.networkTableWrap}>
              <table className={styles.networkTable}>
                <thead><tr><th>Time</th><th>Member</th><th>Category</th><th>Event</th><th>Severity</th><th>Details</th><th>Reference</th></tr></thead>
                <tbody>
                  {snapshot.activityEvents.map((event) => (
                    <tr key={event.id}>
                      <td>{new Date(event.createdAt).toLocaleString()}</td>
                      <td>{event.actorName}</td>
                      <td>{event.category || "system"}</td>
                      <td>{event.action}</td>
                      <td><span className={event.severity === "error" || event.severity === "critical" ? styles.eventError : event.severity === "warning" ? styles.eventWarning : styles.eventInfo}>{event.severity || "error"}</span></td>
                      <td>{event.summary || "—"}</td>
                      <td>{event.targetId || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div><p className={styles.eyebrow}>JaaS / Jitsi telemetry</p><h2>Private network diagnostics</h2></div>
          <span className={styles.muted}>Samples captured every 15 seconds during recording</span>
        </div>
        <div className={styles.networkPanel}>
          <p className={styles.networkIntro}>
            Connection measurements are collected from each participant&apos;s Jitsi client only while a recording is active.
            No IP addresses, device identifiers or media content are stored.
          </p>
          {snapshot.networkSamples === null ? (
            <p className={styles.networkEmpty}>Network diagnostics are currently unavailable.</p>
          ) : snapshot.networkSamples.length === 0 ? (
            <p className={styles.networkEmpty}>No samples yet. Start a lounge recording and this panel will populate as participants send measurements.</p>
          ) : (
            <div className={styles.networkTableWrap}>
              <table className={styles.networkTable}>
                <thead><tr><th>Time</th><th>Participant</th><th>Lounge</th><th>Quality</th><th>Up / down bandwidth</th><th>Packet loss</th><th>JVB RTT</th><th>ICE</th></tr></thead>
                <tbody>
                  {snapshot.networkSamples.map((sample) => (
                    <tr key={sample.id}>
                      <td>{new Date(sample.createdAt).toLocaleString()}</td>
                      <td>{sample.actorName}</td>
                      <td>{sample.roomName || "—"}</td>
                      <td>{sample.connectionQuality == null ? "—" : `${Number(sample.connectionQuality).toFixed(0)}%`}</td>
                      <td>{sample.bandwidthUpload == null ? "—" : `${sample.bandwidthUpload} / ${sample.bandwidthDownload ?? "—"} kbps`}</td>
                      <td>{sample.packetLossTotal == null ? "—" : `${sample.packetLossTotal}%`}</td>
                      <td>{sample.rttMs == null ? "—" : `${sample.rttMs} ms`}</td>
                      <td>{sample.iceConnected == null ? "—" : sample.iceConnected ? "Connected" : "Disconnected"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><p className={styles.eyebrow}>Engineering tools</p><h2>Operations</h2></div></div>
        <div className={styles.tools}>
          <Link className={styles.tool} href="/recordings">
            <span className={styles.toolIcon}>REC</span>
            <span><strong>Recording operations</strong><small>Review the library, pipeline states and private per-recording diagnostics.</small></span>
            <span className={styles.arrow}>↗</span>
          </Link>
          <a className={styles.tool} href="https://github.com/elvisbitolo/yarnerylounge/actions" target="_blank" rel="noreferrer">
            <span className={styles.toolIcon}>CI</span>
            <span><strong>GitHub Actions</strong><small>Inspect builds, scheduled jobs, faststart remux runs and deployment checks.</small></span>
            <span className={styles.arrow}>↗</span>
          </a>
          <a className={styles.tool} href="https://vercel.com/dashboard" target="_blank" rel="noreferrer">
            <span className={styles.toolIcon}>DEP</span>
            <span><strong>Vercel deployments</strong><small>Review production deployments, runtime logs and project settings.</small></span>
            <span className={styles.arrow}>↗</span>
          </a>
          <a className={styles.tool} href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">
            <span className={styles.toolIcon}>DB</span>
            <span><strong>Supabase infrastructure</strong><small>Open database, storage and project monitoring.</small></span>
            <span className={styles.arrow}>↗</span>
          </a>
        </div>
      </section>

      <section className={styles.note}>
        <strong>Access boundary</strong>
        <p>This route checks the authenticated account email on the server. Unauthorized accounts receive a not-found response. The existing recording diagnostics API applies the same allowlist independently. No secrets, service-role keys or signed storage URLs are exposed here.</p>
      </section>
    </main>
  );
}
