// One-shot onboarding for invited members: pre-create every account so the
// only thing left for them to do is sign in.
//
//   node scripts/add-moving-in.mjs --dry-run --file emails.txt
//   node scripts/add-moving-in.mjs --file emails.txt
//   node scripts/add-moving-in.mjs a@b.com c@d.com        (args also work)
//
// For every listed email:
//   1. The Supabase Auth account exists, its password is 12345678 and the
//      email is marked confirmed — sign-in must never stop at a verification
//      link. Existing accounts are reset to the same shared password on
//      purpose; members change it later from Account -> Settings.
//   2. The User row is upserted with plan "moving-in" and paymentStatus
//      "paid" (the membership precheck reads paymentStatus, the plan/expiry
//      gate reads plan + expiresAt — membership.js).
//   3. expiresAt = 2026-11-30 23:59:59 in the member's own timezone: their
//      profile timezone when one is known, otherwise a best-effort pick from
//      the email domain (.au -> Australia/Sydney, .uk/.co.uk -> Europe/London,
//      everything else -> America/New_York).
//
// Courtney (fixed id, below) gets the same plan + expiry normalised in; her
// password is deliberately left alone — only the people in the list get the
// shared password.
//
// The column is TIMESTAMP(3) (no zone) and Prisma reads it as UTC, so every
// instant below is written as a UTC wall-clock string.

import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const TEMP_PASSWORD = "12345678";
const NORMALIZE_ID = "6fbf1525-0e32-45b6-ae5e-96c59e8e4362"; // Courtney
const EXPIRE = { year: 2026, month: 10, day: 30, hour: 23, minute: 59, second: 59 };

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

// ---------------------------------------------------------------- arguments

const rawArgs = process.argv.slice(2);
const dryRun = rawArgs.includes("--dry-run");
const emails = [];
for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i];
  if (arg === "--dry-run") continue;
  if (arg === "--file") {
    const path = rawArgs[++i];
    if (!path) {
      console.error("--file needs a path");
      process.exit(1);
    }
    emails.push(...fs.readFileSync(path, "utf8").split(/[\s,;]+/).filter(Boolean));
    continue;
  }
  if (arg.startsWith("--")) continue;
  emails.push(...arg.split(/[\s,;]+/).filter(Boolean));
}
const uniqueEmails = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
if (!uniqueEmails.length) {
  console.error("Usage: node scripts/add-moving-in.mjs [--dry-run] [--file emails.txt] [email ...]");
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

// ------------------------------------------------------------- time helpers

function zoneFor(email, profileZone) {
  if (typeof profileZone === "string" && profileZone.includes("/")) return profileZone;
  const domain = email.split("@")[1] || "";
  if (domain === "uk" || domain.endsWith(".uk")) return "Europe/London";
  if (domain.endsWith(".au")) return "Australia/Sydney";
  return "America/New_York";
}

// Turns "2026-11-30 23:59:59 in `timeZone`" into the UTC instant. Two fixed
// passes: one converges for any offset, the second settles DST edges (no major
// zone changes clocks on Nov 30, but the loop costs nothing).
function zonedToUtc(spec, timeZone) {
  const naive = Date.UTC(spec.year, spec.month, spec.day, spec.hour, spec.minute, spec.second);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  let ts = naive;
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(
      dtf.formatToParts(new Date(ts)).map((p) => [p.type, p.value])
    );
    const wallAsUtc = Date.UTC(
      +parts.year,
      +parts.month - 1,
      +parts.day,
      +parts.hour,
      +parts.minute,
      +parts.second
    );
    ts = naive - (wallAsUtc - ts);
  }
  return new Date(ts);
}

// TIMESTAMP(3) column, Prisma reads it as UTC: write the UTC wall clock.
function sqlStamp(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function nameFromEmail(email) {
  return email.split("@")[0];
}

function usernameFromEmail(email) {
  return (
    email
      .split("@")[0]
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9]/g, "") || "member"
  );
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

const USER_UPSERT = `
  INSERT INTO "User"
    ("id", "name", "username", "email", "role", "roleLabel", "plan", "paymentStatus", "expiresAt", "createdAt", "updatedAt")
  VALUES ($1, $2, $3, $4, 'member', 'Member', 'moving-in', 'paid', $5, now(), now())
  ON CONFLICT ("id") DO UPDATE SET
    "name" = COALESCE("User"."name", EXCLUDED."name"),
    "username" = COALESCE("User"."username", EXCLUDED."username"),
    "email" = COALESCE("User"."email", EXCLUDED."email"),
    "plan" = 'moving-in',
    "paymentStatus" = 'paid',
    "expiresAt" = EXCLUDED."expiresAt",
    "updatedAt" = now()`;

// provider must NOT be 'open-access': subscription-core.js drops those rows
// as signup-override artifacts ("not a purchase") and the member falls back to
// Flirting on /membership while the badge (reading User.plan) says Diamond.
// 'admin' marks a real host-granted plan that is allowed to govern access.
const SUBSCRIPTION_UPSERT = `
  INSERT INTO "Subscription"
    ("id", "userId", "provider", "status", "plan", "planName", "tier", "role", "updatedAt", "currentPeriodEnd")
  VALUES ($1, $1, 'admin', 'active', 'moving-in', 'Moving In', 'moving-in', 'member', $2, $3)
  ON CONFLICT ("id") DO UPDATE SET
    "provider" = 'admin',
    "status" = 'active',
    "plan" = 'moving-in',
    "planName" = 'Moving In',
    "tier" = 'moving-in',
    "role" = 'member',
    "updatedAt" = $2,
    "currentPeriodEnd" = EXCLUDED."currentPeriodEnd"`;

// ------------------------------------------------------------------- lookups

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
  `SELECT id, email, name, username, plan, timezone FROM "User"`
);
const userByEmail = new Map(
  userRows.filter((r) => r.email).map((r) => [r.email.toLowerCase(), r])
);

// -------------------------------------------------------------- the onboarding

let created = 0;
let updated = 0;
let failed = 0;

console.log(
  `${dryRun ? "[dry-run] " : ""}Onboarding ${uniqueEmails.length} member(s) to plan "moving-in", expiring 2026-11-30 23:59:59 local.\n`
);

for (const email of uniqueEmails) {
  try {
    const auth = authByEmail.get(email) || null;
    const dbRow = userByEmail.get(email) || null;
    const zone = zoneFor(email, dbRow?.timezone);
    const expiresAt = zonedToUtc(EXPIRE, zone);

    let uid = auth?.id || dbRow?.id || null;
    if (!auth) {
      // Prefer the id the User row already carries so profile history stays
      // attached to the account; fall back to Supabase's own id.
      const wantedId = dbRow && isUuid(dbRow.id) ? dbRow.id : undefined;
      if (dryRun) {
        uid = wantedId || "(new auth uid)";
        console.log(`+ ${email} -> would create auth account (zone ${zone}, expires ${sqlStamp(expiresAt)} UTC)`);
      } else {
        const { data: createdAuth, error } = await supabase.auth.admin.createUser({
          ...(wantedId ? { id: wantedId } : {}),
          email,
          password: TEMP_PASSWORD,
          user_metadata: { name: dbRow?.name || nameFromEmail(email) },
          email_confirm: true,
        });
        if (error) throw new Error(`createUser: ${error.message}`);
        uid = createdAuth.user.id;
        created += 1;
        console.log(`✓ Created ${email} (password ${TEMP_PASSWORD})`);
      }
    } else {
      uid = auth.id;
      if (dryRun) {
        console.log(`* ${email} -> would reset password to ${TEMP_PASSWORD} + confirm email`);
      } else {
        const { error } = await supabase.auth.admin.updateUserById(uid, {
          password: TEMP_PASSWORD,
          email_confirm: true,
        });
        if (error) throw new Error(`updateUserById: ${error.message}`);
        updated += 1;
        console.log(`✓ Reset ${email} (password ${TEMP_PASSWORD})`);
      }
    }

    if (!uid) throw new Error("could not resolve a user id");
    if (dbRow && auth && dbRow.id !== uid) {
      console.log(`  ! note: User row id ${dbRow.id} differs from auth id ${uid} for this email`);
    }

    const name = dbRow?.name || nameFromEmail(email);
    const username = dbRow?.username || usernameFromEmail(email);

    if (dryRun) {
      console.log(`  -> plan moving-in, expiresAt ${sqlStamp(expiresAt)} UTC (${zone})`);
    } else {
      await pool.query(USER_UPSERT, [uid, name, username, email, sqlStamp(expiresAt)]);
      await pool.query(SUBSCRIPTION_UPSERT, [uid, sqlStamp(new Date()), sqlStamp(expiresAt)]);
      console.log(`✓ ${email} -> moving-in, expires ${sqlStamp(expiresAt)} UTC (${zone})`);
    }
  } catch (e) {
    failed += 1;
    console.error(`✗ ${email}: ${e.message}`);
  }
}

// ------------------------------------------------------------- normalisation

try {
  const { rows } = await pool.query(
    `SELECT id, email, name, plan, timezone FROM "User" WHERE id = $1`,
    [NORMALIZE_ID]
  );
  const courtney = rows[0];
  if (!courtney) {
    console.log(`! Member ${NORMALIZE_ID} not found — skipped`);
  } else {
    const zone = zoneFor(courtney.email || "", courtney.timezone);
    const expiresAt = zonedToUtc(EXPIRE, zone);
    console.log(
      `\nCourtney (${courtney.email || NORMALIZE_ID}): plan "${courtney.plan}" -> moving-in, expires ${sqlStamp(expiresAt)} UTC (${zone})`
    );
    if (!dryRun) {
      await pool.query(
        `UPDATE "User" SET plan = 'moving-in', "paymentStatus" = 'paid', "expiresAt" = $2, "updatedAt" = now() WHERE id = $1`,
        [NORMALIZE_ID, sqlStamp(expiresAt)]
      );
      await pool.query(SUBSCRIPTION_UPSERT, [
        NORMALIZE_ID,
        sqlStamp(new Date()),
        sqlStamp(expiresAt),
      ]);
      console.log("✓ Courtney normalised (password untouched)");
    }
  }
} catch (e) {
  failed += 1;
  console.error(`✗ Courtney: ${e.message}`);
}

console.log(
  `\n${dryRun ? "[dry-run] would have " : ""}created ${created}, updated ${updated}, failed ${failed}`
);

await pool.end();
process.exit(failed ? 1 : 0);
