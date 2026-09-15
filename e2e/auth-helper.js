// Playwright auth helper (JavaScript).
// Provisions a throwaway Supabase user + Postgres User row + open-access
// Subscription (mirroring what /api/auth/session signup creates), signs them in
// for a real session, and returns the serialized `community-auth` cookie value
// so a Playwright context can authenticate without hitting the login wall.
const { config } = require("dotenv");
const { createClient } = require("@supabase/supabase-js");
const pg = require("pg");

function loadEnv() {
  const existing = { ...process.env };
  config({ path: [".env.local", ".env"] });
  return { ...process.env, ...existing };
}

async function createMember() {
  const env = loadEnv();
  const supabaseUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(supabaseUrl, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const pool = new pg.Pool({
    connectionString:
      env.DIRECT_URL ||
      env.POSTGRES_URL_NON_POOLING ||
      env.DATABASE_URL ||
      env.POSTGRES_PRISMA_URL,
  });

  const email = `pw.${Date.now()}@example.com`;
  const password = "Playwright!12345";
  let uid = "";

  const cleanup = async () => {
    try {
      await pool.query(`DELETE FROM "Post" WHERE "authorId" = $1`, [uid]);
      await pool.query(`DELETE FROM "PostComment" WHERE "authorId" = $1`, [uid]);
      await pool.query(`DELETE FROM "Gamification" WHERE "id" = $1 OR "userId" = $1`, [uid]);
      await pool.query(`DELETE FROM "Notification" WHERE "userId" = $1 OR "actorId" = $1`, [uid]);
      await pool.query(`DELETE FROM "Subscription" WHERE "id" = $1 OR "userId" = $1`, [uid]);
      await pool.query(`DELETE FROM "Follow" WHERE "followerId" = $1 OR "followingId" = $1`, [uid]);
      await pool.query(`DELETE FROM "User" WHERE "id" = $1`, [uid]);
    } catch (e) {
      console.error("playwright cleanup:", e.message);
    }
    try {
      await admin.auth.admin.deleteUser(uid);
    } catch {}
    await pool.end().catch(() => {});
  };

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "Playwright Member", avatar_url: "" },
  });
  if (createErr || !created?.user) throw new Error(`createUser: ${createErr?.message}`);
  uid = created.user.id;

  await pool.query(`INSERT INTO "User" ("id", "email", "name", "role") VALUES ($1,$2,$3,'member')`, [
    uid,
    email,
    "Playwright Member",
  ]);
  await pool.query(
    `INSERT INTO "Subscription" ("id", "userId", "provider", "status", "plan", "planName", "tier", "role", "updatedAt")
     VALUES ($1,$2,'open-access','active','moving-in','moving-in','moving-in','member',$3)`,
    [uid, uid, new Date().toISOString()]
  );

  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({ email, password });
  if (signInErr || !signIn?.session?.access_token) {
    await cleanup();
    throw new Error(`signIn: ${signInErr?.message}`);
  }

  return {
    uid,
    email,
    password,
    supabaseToken: signIn.session.access_token,
    refreshToken: signIn.session.refresh_token,
    cleanup,
  };
}

module.exports = { createMember, loadEnv };