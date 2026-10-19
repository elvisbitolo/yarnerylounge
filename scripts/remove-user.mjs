import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/remove-user.mjs <email>");
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { default: pg } = await import("pg");
const pool = new pg.Pool({
  connectionString:
    process.env.DIRECT_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL,
});

try {
  let uid = null;
  let page = 1;
  while (!uid && page <= 10) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    uid = data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id || null;
    if (!data?.users?.length) break;
    page += 1;
  }

  if (uid) {
    const { error: delErr } = await supabase.auth.admin.deleteUser(uid);
    if (delErr) console.error("Auth delete error:", delErr.message);
    else console.log("✓ Deleted auth user");
  } else {
    console.log("No auth user found");
  }

  await pool.query('DELETE FROM "Subscription" WHERE "userId" = $1 OR "id" = $1', [uid || '00000000-0000-0000-0000-000000000000']);
  const res = await pool.query('DELETE FROM "User" WHERE "email" ILIKE $1 RETURNING id', [email]);
  if (res.rowCount > 0) console.log(`✓ Deleted User row(s) for ${email}`);
  else console.log(`No User row found for ${email}`);
} catch (e) {
  console.error("Error:", e.message);
} finally {
  await pool.end();
}
