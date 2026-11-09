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
    authAttempts: null,
    recentMembers: null,
    memberCount: null,
    notificationActivity: null,
    whatsappDeliveryActivity: null,
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

  try {
    const prisma = getPrisma();
    const rows = await prisma.authAttempt.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, email: true, action: true, provider: true, errorCode: true, errorMessage: true, source: true, createdAt: true },
    });
    snapshot.authAttempts = rows;
    snapshot.noAccountAttempts = rows.filter((row) => {
      const code = String(row.errorCode || "").toLowerCase();
      const message = String(row.errorMessage || "").toLowerCase();
      return ["not_prepaid", "user_not_found", "no_account", "account_not_found"].includes(code)
        || /no (?:member )?account (?:was )?found|account does not exist|user not found|not registered as a member/.test(message);
    });
  } catch {
    snapshot.authAttempts = null;
  }

  try {
    const prisma = getPrisma();
    const [members, memberCount] = await Promise.all([
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, name: true, email: true, plan: true, paymentStatus: true, role: true, createdAt: true },
      }),
      prisma.user.count(),
    ]);
    snapshot.recentMembers = members;
    snapshot.memberCount = memberCount;
  } catch {
    snapshot.recentMembers = null;
    snapshot.memberCount = null;
  }

  try {
    const prisma = getPrisma();
    snapshot.notificationActivity = await prisma.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true, userId: true, type: true, actorName: true, text: true,
        read: true, href: true, createdAt: true,
        user: { select: { name: true, email: true } },
      },
    });
  } catch {
    snapshot.notificationActivity = null;
  }

  try {
    const prisma = getPrisma();
    snapshot.whatsappDeliveryActivity = await prisma.whatsAppMessage.findMany({
      where: { direction: "outbound" },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, userId: true, toPhone: true, text: true, status: true, providerMessageId: true, createdAt: true },
    });
  } catch {
    snapshot.whatsappDeliveryActivity = null;
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
          <div><p className={styles.eyebrow}>Supabase authentication</p><h2>Unsuccessful auth attempts</h2></div>
          <span className={styles.muted}>Latest 100 · newest first</span>
        </div>
        <div className={styles.networkPanel}>
          <p className={styles.networkIntro}>Failed email/password sign-in and registration attempts reported by the application, including the submitted email, provider, error code and time. Passwords and access tokens are never collected.</p>
          {snapshot.authAttempts === null ? (
            <p className={styles.networkEmpty}>Authentication logs are unavailable. Confirm the AuthAttempt database migration has been applied.</p>
          ) : snapshot.authAttempts.length === 0 ? (
            <p className={styles.networkEmpty}>No failed authentication attempts have been reported yet.</p>
          ) : (
            <div className={styles.networkTableWrap}>
              <table className={styles.networkTable}>
                <thead><tr><th>Time</th><th>Email submitted</th><th>Action</th><th>Provider</th><th>Error code</th><th>Error details</th><th>Source</th></tr></thead>
                <tbody>
                  {snapshot.authAttempts.map((attempt) => (
                    <tr key={attempt.id}>
                      <td>{new Date(attempt.createdAt).toLocaleString()}</td>
                      <td>{attempt.email || "Not supplied"}</td>
                      <td>{attempt.action}</td>
                      <td>{attempt.provider}</td>
                      <td><span className={styles.eventError}>{attempt.errorCode || "auth_error"}</span></td>
                      <td className={styles.authErrorDetails}>{attempt.errorMessage || "Authentication was unsuccessful"}</td>
                      <td>{attempt.source}</td>
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
          <div><p className={styles.eyebrow}>Prospective members</p><h2>Sign-in attempts without a member account</h2></div>
          <span className={styles.muted}>Confirmed no-account signals · latest 100 auth attempts scanned</span>
        </div>
        <div className={styles.networkPanel}>
          <p className={styles.networkIntro}>People who reached sign-in but were not recognized as an eligible Secret Yarnery member. This list uses explicit no-account signals only; generic “invalid login credentials” errors are excluded because Supabase intentionally does not reveal whether an email exists or the password is wrong.</p>
          {snapshot.authAttempts === null ? (
            <p className={styles.networkEmpty}>Authentication logs are unavailable. Confirm the AuthAttempt database migration has been applied.</p>
          ) : snapshot.noAccountAttempts.length === 0 ? (
            <p className={styles.networkEmpty}>No confirmed no-account sign-in attempts have been recorded yet.</p>
          ) : (
            <div className={styles.networkTableWrap}>
              <table className={styles.networkTable}>
                <thead><tr><th>Time</th><th>Email submitted</th><th>Provider</th><th>Reason</th><th>Source</th></tr></thead>
                <tbody>
                  {snapshot.noAccountAttempts.map((attempt) => (
                    <tr key={attempt.id}>
                      <td>{new Date(attempt.createdAt).toLocaleString()}</td>
                      <td>{attempt.email || "Not supplied by provider"}</td>
                      <td>{attempt.provider}</td>
                      <td className={styles.authErrorDetails}>{attempt.errorMessage || attempt.errorCode || "No member account found"}</td>
                      <td>{attempt.source}</td>
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
          <div><p className={styles.eyebrow}>Member directory</p><h2>Successful registrations</h2></div>
          <span className={styles.muted}>{snapshot.memberCount == null ? "Total unavailable" : `${snapshot.memberCount.toLocaleString()} accounts · latest 100 shown`}</span>
        </div>
        <div className={styles.networkPanel}>
          <p className={styles.networkIntro}>Accounts successfully provisioned in the application database, including email/password and OAuth registrations. This reflects persisted member records, not attempted signups.</p>
          {snapshot.recentMembers === null ? (
            <p className={styles.networkEmpty}>Registered member records are currently unavailable.</p>
          ) : snapshot.recentMembers.length === 0 ? (
            <p className={styles.networkEmpty}>No member accounts have been registered yet.</p>
          ) : (
            <div className={styles.networkTableWrap}>
              <table className={styles.networkTable}>
                <thead><tr><th>Registered</th><th>Name</th><th>Email</th><th>Plan</th><th>Payment status</th><th>Role</th><th>Account ID</th></tr></thead>
                <tbody>
                  {snapshot.recentMembers.map((member) => (
                    <tr key={member.id}>
                      <td>{member.createdAt ? new Date(member.createdAt).toLocaleString() : "—"}</td>
                      <td>{member.name || "—"}</td>
                      <td>{member.email || "—"}</td>
                      <td>{member.plan || "Not assigned"}</td>
                      <td>{member.paymentStatus || "—"}</td>
                      <td>{member.role || "member"}</td>
                      <td>{member.id}</td>
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
          <div><p className={styles.eyebrow}>Notification monitoring</p><h2>In-app notification activity</h2></div>
          <span className={styles.muted}>Latest 100 · newest first</span>
        </div>
        <div className={styles.networkPanel}>
          <p className={styles.networkIntro}>Persisted notification records with recipient, category, message, read state and timestamp. These rows confirm in-app notification creation; they do not prove browser push or email delivery.</p>
          {snapshot.notificationActivity === null ? (
            <p className={styles.networkEmpty}>Notification records are currently unavailable.</p>
          ) : snapshot.notificationActivity.length === 0 ? (
            <p className={styles.networkEmpty}>No in-app notifications have been recorded yet.</p>
          ) : (
            <div className={styles.networkTableWrap}>
              <table className={styles.networkTable}>
                <thead><tr><th>Created</th><th>Recipient</th><th>Email</th><th>Type</th><th>Message</th><th>Read</th><th>Destination</th></tr></thead>
                <tbody>
                  {snapshot.notificationActivity.map((notification) => (
                    <tr key={notification.id}>
                      <td>{new Date(notification.createdAt).toLocaleString()}</td>
                      <td>{notification.user?.name || notification.userId}</td>
                      <td>{notification.user?.email || "—"}</td>
                      <td>{notification.type}</td>
                      <td className={styles.authErrorDetails}>{notification.text}</td>
                      <td><span className={notification.read ? styles.eventInfo : styles.eventWarning}>{notification.read ? "Read" : "Unread"}</span></td>
                      <td>{notification.href || "—"}</td>
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
          <div><p className={styles.eyebrow}>WhatsApp delivery</p><h2>Outbound WhatsApp messages</h2></div>
          <span className={styles.muted}>Latest 60 · newest first</span>
        </div>
        <div className={styles.networkPanel}>
          <p className={styles.networkIntro}>Outbound WhatsApp messages recorded after the provider accepts a message. Delivery and read states depend on incoming Meta receipts; a status of sent does not mean delivered or read.</p>
          {snapshot.whatsappDeliveryActivity === null ? (
            <p className={styles.networkEmpty}>WhatsApp delivery records are currently unavailable.</p>
          ) : snapshot.whatsappDeliveryActivity.length === 0 ? (
            <p className={styles.networkEmpty}>No outbound WhatsApp messages have been recorded yet.</p>
          ) : (
            <div className={styles.networkTableWrap}>
              <table className={styles.networkTable}>
                <thead><tr><th>Created</th><th>Recipient account</th><th>Phone</th><th>Message</th><th>Provider status</th><th>Provider ID</th></tr></thead>
                <tbody>
                  {snapshot.whatsappDeliveryActivity.map((message) => (
                    <tr key={message.id}>
                      <td>{new Date(message.createdAt).toLocaleString()}</td>
                      <td>{message.userId}</td>
                      <td>{message.toPhone || "—"}</td>
                      <td className={styles.authErrorDetails}>{message.text || "—"}</td>
                      <td><span className={message.status === "failed" ? styles.eventError : message.status === "delivered" || message.status === "read" ? styles.eventInfo : styles.eventWarning}>{message.status || "unknown"}</span></td>
                      <td>{message.providerMessageId || "—"}</td>
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
