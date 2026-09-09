import { config } from "dotenv";
config({ path: [".env.local", ".env"] });
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const BASE = process.env.SMOKE_TEST_BASE || "http://localhost:3000";
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) process.exit(1);

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const pool = new pg.Pool({
  connectionString:
    process.env.DIRECT_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL,
});

const email = `newuser.${Date.now()}@example.com`;
const password = "SmokeTest!12345";
let uid = "";

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
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { name: "New User Repro", avatar_url: "" },
  });
  if (createErr || !created?.user) { console.error("createUser failed:", createErr?.message); process.exit(1); }
  uid = created.user.id;
  process.env.__smoke_sb_uid = uid;
  console.log("created supabase user", uid, email);

  // NO pre-inserted User row — exercises the new-user branch
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({ email, password });
  if (signInErr || !signIn?.session?.access_token) {
    console.error("signIn failed:", signInErr?.message); await cleanup(); process.exit(1);
  }
  const access = signIn.session.access_token;
  const refresh = signIn.session.refresh_token;

  const when = Date.now();
  const sessRes = await fetch(`${BASE}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ supabaseToken: access, supabaseRefreshToken: refresh }),
  });
  const body = await sessRes.json().catch(() => ({}));
  console.log(`session -> ${sessRes.status} :: ${JSON.stringify(body).slice(0,120)}`);
  const setCookies = sessRes.headers.getSetCookie?.() || [];
  console.log("set-cookie count:", setCookies.length);
  console.log("elapsed ms:", Date.now() - when);

  const dbcheck = await pool.query(`SELECT id, "isPrePaid", role FROM "User" WHERE id = $1`, [uid]);
  console.log("db User rows:", JSON.stringify(dbcheck.rows));
  const sub = await pool.query(`SELECT id, provider, status, plan, tier, role FROM "Subscription" WHERE id = $1`, [uid]);
  console.log("db Subscription rows:", JSON.stringify(sub.rows));

  await cleanup();
}
main().catch((e) => { console.error("script error:", e); process.exit(1); });