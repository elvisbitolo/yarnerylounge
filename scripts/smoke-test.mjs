/* End-to-end smoke test against the running `next dev` server.
 *
 * - Creates a throwaway Supabase test user via the service role
 * - Also creates a matching Postgres User row (id = supabase uid) + an open-access
 *   Subscription so authenticated writes pass the membership gate
 * - Signs them in to get a real Supabase access token
 * - POST /api/auth/session -> session cookie
 * - Probes protected read + a write/delete cycle with that cookie
 * - Reports PASS/FAIL per route; deletes the test user + rows in all cases
 *
 * Usage: node scripts/smoke-test.mjs
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const BASE = process.env.SMOKE_TEST_BASE || "http://localhost:3000";
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const pool = new pg.Pool({
  connectionString:
    process.env.DIRECT_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL,
});

const email = `smoke.${Date.now()}@example.com`;
const password = "SmokeTest!12345";
let uid = "";

const RESULTS = [];
function record(label, res, body) {
  const ok = res.ok;
  RESULTS.push({ label, status: res.status, ok });
  console.log(
    `${ok ? "PASS" : "FAIL"} ${label} -> ${res.status}` +
      (res.status >= 400 ? ` :: ${String(body?.error || body?.message || "").slice(0, 100)}` : "")
  );
}

function cookieFrom(res) {
  const set = res.headers.getSetCookie?.() || [];
  const sc = set.find((c) => c.startsWith("community-auth="));
  return sc ? sc.split(";")[0] : null;
}

async function cleanup() {
  try {
    await pool.query(`DELETE FROM "Post" WHERE "authorId" = $1`, [uid]);
    await pool.query(`DELETE FROM "PostComment" WHERE "authorId" = $1`, [uid]);
    await pool.query(`DELETE FROM "Gamification" WHERE "id" = $1 OR "userId" = $1`, [uid]);
    await pool.query(`DELETE FROM "Notification" WHERE "userId" = $1 OR "actorId" = $1`, [uid]);
    await pool.query(`DELETE FROM "Subscription" WHERE "id" = $1 OR "userId" = $1`, [uid]);
    await pool.query(`DELETE FROM "User" WHERE "id" = $1`, [uid]);
  } catch (e) {
    console.error("pg cleanup:", e.message);
  }
  try {
    await admin.auth.admin.deleteUser(process.env.__smoke_sb_uid || "");
  } catch {}
}

async function main() {
  // 1. create + confirm a throwaway Supabase user
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "Smoke Test Member", avatar_url: "" },
  });
  if (createErr || !created?.user) {
    console.error("createUser failed:", createErr?.message);
    process.exit(1);
  }
  const sbUid = created.user.id;
  uid = sbUid;
  process.env.__smoke_sb_uid = sbUid;

  // 2. matching Postgres User row + open-access Subscription (mirrors what the
  //    app's /api/auth/session signup creates while open access is on)
  await pool.query(
    `INSERT INTO "User" ("id", "email", "name", "role") VALUES ($1,$2,$3,'member')`,
    [sbUid, email, "Smoke Test Member"]
  );
  await pool.query(
    `INSERT INTO "Subscription" ("id", "userId", "provider", "status", "plan", "planName", "tier", "role", "updatedAt")
     VALUES ($1,$2,'open-access','active','moving-in','moving-in','moving-in','member',$3)`,
    [sbUid, sbUid, new Date().toISOString()]
  );

  // 3. sign in for a real session
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({ email, password });
  if (signInErr || !signIn?.session?.access_token) {
    console.error("signIn failed:", signInErr?.message);
    await cleanup();
    process.exit(1);
  }
  const access = signIn.session.access_token;
  const refresh = signIn.session.refresh_token;

  // 4. exchange for the session cookie
  const sessRes = await fetch(`${BASE}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ supabaseToken: access, supabaseRefreshToken: refresh }),
  });
  const sessBody = await sessRes.json().catch(() => ({}));
  record("POST /api/auth/session", sessRes, sessBody);
  const cookie = cookieFrom(sessRes);
  if (!sessRes.ok || !cookie) {
    console.error("no session cookie — aborting");
    await cleanup();
    process.exit(1);
  }

  const H = { Cookie: cookie, "Content-Type": "application/json" };

  // 5a. protected reads
  const reads = ["/api/discovery", "/api/members/similar", "/api/checklist"];
  for (const p of reads) {
    const r = await fetch(`${BASE}${p}`, { headers: { Cookie: cookie } });
    const b = await r.json().catch(() => ({}));
    record(`GET ${p}`, r, b);
  }

  // 5b. authenticated write + delete cycle
  const local = Date.now();
  const createPost = await fetch(`${BASE}/api/posts`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ text: `Smoke test post ${local}`, imageUrl: "" }),
  });
  let postBody = {};
  try {
    postBody = await createPost.json();
  } catch {}
  record("POST /api/posts", createPost, postBody);

  if (createPost.ok && postBody?.id) {
    const del = await fetch(`${BASE}/api/posts/${postBody.id}`, { method: "DELETE", headers: H });
    record("DELETE /api/posts/:id", del, {});
  }

  // 5c. unauthenticated negative check
  const noAuth = await fetch(`${BASE}/api/discovery`);
  const noAuthBody = await noAuth.json().catch(() => ({}));
  const naPass = noAuth.status === 401;
  RESULTS.push({ label: "GET /api/discovery (no cookie) -> 401", status: noAuth.status, ok: naPass });
  console.log(`${naPass ? "PASS" : "FAIL"} GET /api/discovery (no cookie) -> ${noAuth.status}`);

  // 6. cleanup
  await cleanup();

  // 7. summary
  const fails = RESULTS.filter((r) => !r.ok);
  console.log("\n================ SUMMARY ================");
  console.log(`total: ${RESULTS.length}  passed: ${RESULTS.length - fails.length}  failed: ${fails.length}`);
  if (fails.length) {
    fails.forEach((f) => console.log(`  ${f.label} (${f.status})`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("script error:", e);
  process.exit(1);
});