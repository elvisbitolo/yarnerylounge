"use client";

import styles from "./docs.module.css";

export default function DeveloperDocs() {
  const base = `https://${process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "") || "yarnerylounge.com"}`;
  const v1 = `${base}/api/v1`;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>API Reference</h1>
        <p>Personal access tokens only. All requests require <code>Authorization: Bearer &lt;token&gt;</code>.</p>
      </header>

      <section className={styles.card}>
        <h2>Authentication</h2>
        <pre className={styles.codeBlock}>
{`curl "${v1}/me" -H "Authorization: Bearer yry_live_..."`}
        </pre>
        <p>401 = missing/invalid/revoked/expired token. 403 = missing scope.</p>
      </section>

      <section className={styles.card}>
        <h2>GET /api/v1/me</h2>
        <p>Scope: <code>read:profile</code></p>
        <pre className={styles.codeBlock}>
{`curl "${v1}/me" -H "Authorization: Bearer <token>"`}
        </pre>
        <pre className={styles.codeBlock}>
{`{"data":{"id":"u1","name":"Ada","username":"ada","headline":"Crocheter","bio":"...","location":"Nairobi","country":"KE","photoURL":"...","role":"member","crafts":["crochet"],"hobbies":["reading"],"skillLevel":"advanced","yearsExperience":"2","favoriteYarnBrand":"Brand","goToYarn":"Cotton","createdAt":"2026-01-02T00:00:00.000Z"}}`}
        </pre>
      </section>

      <section className={styles.card}>
        <h2>GET /api/v1/members</h2>
        <p>Scope: <code>read:members</code></p>
        <p>Query: <code>limit</code> (1–50), <code>offset</code> (0+), <code>q</code> (search name/username/headline)</p>
        <pre className={styles.codeBlock}>
{`curl "${v1}/members?limit=10&offset=0" -H "Authorization: Bearer <token>"`}
        </pre>
      </section>

      <section className={styles.card}>
        <h2>GET /api/v1/members/:id</h2>
        <p>Scope: <code>read:members</code>. Returns 404 if the profile is private, suspended, or blocked.</p>
        <pre className={styles.codeBlock}>
{`curl "${v1}/members/u1" -H "Authorization: Bearer <token>"`}
        </pre>
      </section>

      <section className={styles.card}>
        <h2>GET /api/v1/posts</h2>
        <p>Scope: <code>read:posts</code>. Returns public community posts and your own posts (space/group-only posts excluded).</p>
        <p>Query: <code>limit</code> (1–50), <code>offset</code> (0+)</p>
        <pre className={styles.codeBlock}>
{`curl "${v1}/posts?limit=20&offset=0" -H "Authorization: Bearer <token>"`}
        </pre>
      </section>

      <section className={styles.card}>
        <h2>GET /api/v1/events</h2>
        <p>Scope: <code>read:events</code>. Returns public, community-wide events only (space/members-only excluded).</p>
        <p>Query: <code>limit</code> (1–50), <code>offset</code> (0+), <code>upcoming</code> (default <code>1</code>; <code>0</code> for past+upcoming)</p>
        <pre className={styles.codeBlock}>
{`curl "${v1}/events?upcoming=1&limit=10" -H "Authorization: Bearer <token>"`}
        </pre>
      </section>

      <section className={styles.card}>
        <h2>Rate limits & CORS</h2>
        <p>120 requests/min per token. <code>Access-Control-Allow-Origin: *</code> is set on all GET/OPTIONS responses.</p>
      </section>
    </div>
  );
}
