// Creates the two test accounts used to compare the tiers side by side.
//
//   node scripts/create-test-accounts.mjs --dry-run
//   node scripts/create-test-accounts.mjs
//
//   flirting@gmail.com   / 12345678   -> Flirting   (free, $0)
//   hookingup@gmail.com  / 12345678   -> Hooking Up (paid)
//
// Both accounts get a confirmed Supabase Auth user, so sign-in never stops at
// a verification link, and a User row with the tier written on it, which is
// what the badge and the member directory read.
//
// The tier itself is decided in two places and both have to agree:
//
//   - User.plan drives the badge and the label (membership.js ->
//     deriveMembership).
//   - The Subscription row drives what the server grants
//     (subscription.js -> getAccessSub). With no Subscription row, a member
//     falls back to the free tier, so the free account gets none. The paid
//     account gets one with provider "admin": "open-access" rows are dropped
//     as signup artefacts and "shopify" rows would claim a purchase that never
//     happened.
//
// Both accounts have their Terms of Service consent recorded, so they go
// straight into the app instead of stopping on the consent screen.

import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const TEMP_PASSWORD = "12345678";
const TOS_VERSION = "2026-10-06";

const ACCOUNTS = [
  {
    email: "flirting@gmail.com",
    name: "Flirting",
    username: "flirting",
    plan: "flirting",
    planName: "Flirting",
    paymentStatus: "unpaid",
    paid: false,
  },
  {
    email: "hookingup@gmail.com",
    name: "Hooking Up",
    username: "hookingup",
    plan: "hooking-up",
    planName: "Hooking Up",
    paymentStatus: "paid",
    paid: true,
  },
];

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

const dryRun = process.argv.includes("--dry-run");

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshSession: false, autoRefreshToken: false },
});

const { default: pg } = await import("pg");
const pool = new pg.Pool({
  connectionString:
    process.env.DIRECT_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL,
});

// The paid account is good for a year from now, so it never expires mid-test.
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const USER_UPSERT = `
  INSERT INTO "User"
    ("id", "name", "username", "email", "role", "roleLabel", "plan", "paymentStatus",
     "expiresAt", "tosAcceptedAt", "tosVersion", "createdAt", "updatedAt")
  VALUES ($1, $2, $3, $4, 'member', 'Member', $5, $6, $7, now(), $8, now(), now())
  ON CONFLICT ("id") DO UPDATE SET
    "name" = EXCLUDED."name",
    "username" = EXCLUDED."username",
    "email" = EXCLUDED."email",
    "plan" = EXCLUDED."plan",
    "paymentStatus" = EXCLUDED."paymentStatus",
    "expiresAt" = EXCLUDED."expiresAt",
    "tosAcceptedAt" = EXCLUDED."tosAcceptedAt",
    "tosVersion" = EXCLUDED."tosVersion",
    "updatedAt" = now()`;

const SUBSCRIPTION_UPSERT = `
  INSERT INTO "Subscription"
    ("id", "userId", "provider", "status", "plan", "planName", "tier", "role",
     "updatedAt", "currentPeriodStart", "currentPeriodEnd")
  VALUES ($1, $1, 'admin', 'active', $2, $3, $2, 'member', now(), $4, $5)
  ON CONFLICT ("id") DO UPDATE SET
    "provider" = 'admin',
    "status" = 'active',
    "plan" = EXCLUDED."plan",
    "planName" = EXCLUDED."planName",
    "tier" = EXCLUDED."tier",
    "role" = 'member',
    "updatedAt" = now(),
    "currentPeriodStart" = EXCLUDED."currentPeriodStart",
    "currentPeriodEnd" = EXCLUDED."currentPeriodEnd"`;

const SUBSCRIPTION_DELETE = `DELETE FROM "Subscription" WHERE "id" = $1`;

// ---------------------------------------------------------------- lookups

const authByEmail = new Map();
for (let page = 1; page <= 50; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) {
    console.error("Could not list Supabase users:", error.message);
    process.exit(1);
  }
  for (const u of data?.users || []) {
    if (u.email) authByEmail.set(u.email.toLowerCase(), u);
  }
  if (!data?.users?.length || data.users.length < 1000) break;
}

const { rows: userRows } = await pool.query(
  `SELECT id, email FROM "User" WHERE email = ANY($1)`,
  [ACCOUNTS.map((a) => a.email)]
);
const userByEmail = new Map(userRows.map((r) => [r.email.toLowerCase(), r]));

// ------------------------------------------------------------------- the work

let created = 0;
let updated = 0;
let failed = 0;

console.log(
  `${dryRun ? "[dry-run] " : ""}Setting up ${ACCOUNTS.length} test account(s).\n`
);

for (const account of ACCOUNTS) {
  try {
    const email = account.email.toLowerCase();
    const auth = authByEmail.get(email) || null;
    const dbRow = userByEmail.get(email) || null;
    const expiresAt = account.paid ? new Date(Date.now() + YEAR_MS) : null;

    let uid = auth?.id || dbRow?.id || null;
    if (!auth) {
      if (dryRun) {
        uid = dbRow?.id || "(new auth uid)";
        console.log(`+ ${email} -> would create auth account`);
      } else {
        const { data, error } = await supabase.auth.admin.createUser({
          email,
          password: TEMP_PASSWORD,
          user_metadata: { name: account.name },
          email_confirm: true,
        });
        if (error) throw new Error(`createUser: ${error.message}`);
        uid = data.user.id;
        created += 1;
        console.log(`✓ Created auth account ${email}`);
      }
    } else {
      uid = auth.id;
      if (dryRun) {
        console.log(`* ${email} -> would reset the password`);
      } else {
        const { error } = await supabase.auth.admin.updateUserById(uid, {
          password: TEMP_PASSWORD,
          email_confirm: true,
        });
        if (error) throw new Error(`updateUserById: ${error.message}`);
        updated += 1;
        console.log(`✓ Reset the password for ${email}`);
      }
    }

    if (!uid) throw new Error("could not resolve a user id");

    if (dryRun) {
      console.log(
        `  -> ${account.planName}: plan ${account.plan}, payment ${account.paymentStatus}` +
          (expiresAt ? `, expires ${expiresAt.toISOString()}` : ", no expiry")
      );
      continue;
    }

    await pool.query(USER_UPSERT, [
      uid,
      account.name,
      account.username,
      email,
      account.plan,
      account.paymentStatus,
      expiresAt,
      TOS_VERSION,
    ]);

    if (account.paid) {
      await pool.query(SUBSCRIPTION_UPSERT, [
        uid,
        account.plan,
        account.planName,
        new Date(),
        expiresAt,
      ]);
    } else {
      // A leftover paid row would silently promote the free account.
      await pool.query(SUBSCRIPTION_DELETE, [uid]);
    }

    console.log(
      `✓ ${email} -> ${account.planName} (plan ${account.plan}, payment ${account.paymentStatus})`
    );
  } catch (e) {
    failed += 1;
    console.error(`✗ ${account.email}: ${e.message}`);
  }
}

console.log(
  `\n${dryRun ? "[dry-run] would have " : ""}created ${created}, updated ${updated}, failed ${failed}`
);
if (!dryRun) {
  console.log("Sign in with either email and the password 12345678.");
}

await pool.end();
process.exit(failed ? 1 : 0);
