import fs from "fs";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const email = process.argv[2];
const name = process.argv[3];
if (!email) {
  console.error("Usage: node scripts/create-owner.mjs <email> [name]");
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

let uid;
try {
  const { data: found } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  // find by email across pages
  let existing = null;
  let page = 1;
  while (!existing && page <= 5) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    existing = data?.users?.find((u) => u.email === email) || null;
    if (!data?.users?.length) break;
    page += 1;
  }
  if (existing) {
    uid = existing.id;
    console.log(`Account already exists for ${email} — promoting only`);
  }
} catch {
  /* fall through to create */
}

if (!uid) {
  const password = `${name || "Member"}${crypto.randomBytes(4).toString("hex")}!`;
  const { data: created, error } = await supabase.auth.admin.createUser({
    email,
    password,
    user_metadata: { name: name || email.split("@")[0] },
    email_confirm: true,
  });
  if (error) {
    console.error("Failed to create Supabase user:", error.message);
    process.exit(1);
  }
  uid = created.user.id;
  console.log(`Created account for ${email} (${uid})`);
  console.log(`Temporary password: ${password}`);
}

// Upsert the Postgres User + Subscription rows (owner).
const { default: pg } = await import("pg");
const pool = new pg.Pool({
  connectionString:
    process.env.DIRECT_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL,
});
await pool.query(
  `INSERT INTO "User" ("id", "name", "username", "email", "role", "roleLabel", "plan")
   VALUES ($1, $2, $3, $4, 'owner', 'Owner', 'moving-in')
   ON CONFLICT ("id") DO UPDATE SET "role" = 'owner', "roleLabel" = 'Owner'`,
  [uid, name || email.split("@")[0], email.split("@")[0], email]
);
await pool.query(
  `INSERT INTO "Subscription" ("id", "userId", "provider", "status", "plan", "planName", "tier", "role")
   VALUES ($1, $1, 'open-access', 'active', 'moving-in', 'Moving In', 'moving-in', 'host')
   ON CONFLICT ("id") DO UPDATE SET "status" = 'active'`,
  [uid]
);
await pool.end();

console.log(`Promoted ${email} (${uid}) to owner`);
process.exit(0);