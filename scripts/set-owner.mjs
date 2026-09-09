import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/set-owner.mjs <email>");
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let uid = null;
let page = 1;
while (!uid && page <= 5) {
  const { data } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  uid = data?.users?.find((u) => u.email === email)?.id || null;
  if (!data?.users?.length) break;
  page += 1;
}
if (!uid) {
  console.error(`No Supabase user found with email ${email}`);
  process.exit(1);
}

const { default: pg } = await import("pg");
const pool = new pg.Pool({
  connectionString:
    process.env.DIRECT_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL,
});
await pool.query(
  `UPDATE "User" SET "role" = 'owner', "roleLabel" = 'Owner' WHERE "id" = $1`,
  [uid]
);
await pool.end();

console.log(`Promoted ${email} (${uid}) to owner`);
process.exit(0);