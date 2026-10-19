import fs from "fs";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

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

const emails = process.argv.slice(2);
if (!emails.length) {
  console.error("Usage: node scripts/add-moving-in.mjs <email1> [email2] ... [emailN]");
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

const { default: pg } = await import("pg");
const pool = new pg.Pool({
  connectionString:
    process.env.DIRECT_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL,
});

for (const email of emails) {
  try {
    let uid;
    let existing = null;
    let page = 1;
    while (!existing && page <= 10) {
      const { data } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      existing = data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase()) || null;
      if (!data?.users?.length) break;
      page += 1;
    }
    if (existing) {
      uid = existing.id;
      console.log(`✓ Found ${email}`);
    } else {
      const displayName = email.split("@")[0];
      const tempPassword = `${displayName}${crypto.randomBytes(4).toString("hex")}!`;
      const { data: created, error } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        user_metadata: { name: displayName },
        email_confirm: true,
      });
      if (error) {
        console.error(`✗ Failed to create ${email}:`, error.message);
        continue;
      }
      uid = created.user.id;
      console.log(`✓ Created ${email} (temp: ${tempPassword})`);
    }

    const displayName = email.split("@")[0];
    const username = displayName.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "") || "member";
    await pool.query(
      `INSERT INTO "User" ("id", "name", "username", "email", "role", "roleLabel", "plan")
       VALUES ($1, $2, $3, $4, 'member', 'Member', 'moving-in')
       ON CONFLICT ("id") DO UPDATE SET 
         "name" = COALESCE("User"."name", EXCLUDED."name"),
         "email" = COALESCE("User"."email", EXCLUDED."email"),
         "username" = COALESCE("User"."username", EXCLUDED."username"),
         "role" = 'member',
         "roleLabel" = 'Member',
         "plan" = 'moving-in'`,
      [uid, displayName, username, email]
    );

    const now = new Date();
    const yearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO "Subscription" ("id", "userId", "provider", "status", "plan", "planName", "tier", "role", "updatedAt", "currentPeriodEnd")
       VALUES ($1, $1, 'open-access', 'active', 'moving-in', 'Moving In', 'moving-in', 'member', $2, $3)
       ON CONFLICT ("id") DO UPDATE SET 
         "status" = 'active',
         "plan" = 'moving-in',
         "planName" = 'Moving In',
         "tier" = 'moving-in',
         "role" = 'member',
         "updatedAt" = $2,
         "currentPeriodEnd" = COALESCE("Subscription"."currentPeriodEnd", $3)`,
      [uid, now.toISOString(), yearFromNow.toISOString()]
    );
    console.log(`✓ Added ${email} as moving-in member`);
  } catch (e) {
    console.error(`✗ Error for ${email}:`, e.message);
  }
}

await pool.end();
