// Narrows "owner" to an explicit allowlist and demotes every other owner to
// "moderator". Owner is deliberately not grantable through the admin API
// (PATCH /api/admin/members/[id] only accepts member|moderator), so this script
// is the only way to set it -- which makes it the right place to be careful.
//
// Why demote to moderator and not member: TIER_FOR_ROLE in src/lib/server/plans.js
// maps BOTH owner and moderator to "moving-in", and isStaff() in
// src/lib/server/subscription.js treats them identically. So a demotion to
// moderator keeps the member's tier, badge, room-hosting rights and
// subscription bypass, while giving up the owner-only surfaces:
// recordings management, spaces/courses/push/seed routes, and the ability to
// delete another member's post (posts.js grants that to owner only).
//
// Safe by default: this is a DRY RUN. Pass --apply to write.
//
//   node scripts/limit-owners.mjs
//   node scripts/limit-owners.mjs --apply
//   node scripts/limit-owners.mjs --apply --keep elvisbitolo11@gmail.com,secretyarnery@gmail.com
//   node scripts/limit-owners.mjs --apply --purge-dormant
//
// --purge-dormant DELETEs the never-signed-in accounts instead of demoting them.
// Deletion is irreversible and cascades across every User relation, so the
// script reports what each account holds before touching anything.

import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  // Values in .env.local are quoted. Without stripping the quotes the SDKs
  // reject them ("Invalid supabaseUrl"), so unwrap before assigning.
  const value = m[2].trim().replace(/^["']|["']$/g, "");
  if (!process.env[m[1]]) process.env[m[1]] = value;
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const purgeDormant = args.includes("--purge-dormant");
const keepIdx = args.indexOf("--keep");
const keepArg = keepIdx === -1 ? null : args[keepIdx + 1];
const keep = new Set(
  (keepArg || "elvisbitolo11@gmail.com,secretyarnery@gmail.com")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

const { default: pg } = await import("pg");
const pool = new pg.Pool({
  connectionString:
    process.env.DIRECT_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL,
});

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupFile = `scripts/.role-backup-${stamp}.json`;

// The operator is recorded as the actor so the audit trail attributes the
// change to a real account rather than an empty string.
const OPERATOR_EMAIL = "elvisbitolo11@gmail.com";

try {
  const { rows: owners } = await pool.query(
    `SELECT id, name, email, role, "roleLabel", plan FROM "User" WHERE role = 'owner' ORDER BY email`
  );

  if (owners.length === 0) {
    console.log("No users with role = 'owner'. Nothing to do.");
    process.exit(0);
  }

  // Guard: every allowlisted address must actually exist as an owner. If one is
  // missing we abort rather than demote a bystander into a two-owner gap.
  const missing = [...keep].filter(
    (e) => !owners.some((o) => (o.email || "").toLowerCase() === e)
  );
  if (missing.length) {
    console.error(
      `ABORT: allowlisted owner(s) not found: ${missing.join(", ")}\n` +
        `Fix the --keep list, or correct the account's email, then re-run.`
    );
    process.exit(1);
  }

  const demote = owners.filter((o) => !keep.has((o.email || "").toLowerCase()));

  // Warn on accounts that have never signed in. Promoting a dormant login to a
  // privileged role means credentials nobody is watching hold elevated rights.
  const { rows: dormant } = await pool.query(
    `SELECT u.id, u.email FROM "User" u
      WHERE u.id = ANY($1::text[])
        AND NOT EXISTS (SELECT 1 FROM "Session" s WHERE s."userId" = u.id)`,
    [demote.map((d) => d.id)]
  );
  const dormantIds = new Set(dormant.map((d) => d.id));

  const purge = purgeDormant ? demote.filter((d) => dormantIds.has(d.id)) : [];
  const toModerate = demote.filter((d) => !dormantIds.has(d.id));

  console.log(`\nKEEP as owner (${owners.length - demote.length}):`);
  for (const o of owners.filter((o) => keep.has((o.email || "").toLowerCase()))) {
    console.log(`  ${o.email}  (${o.id})`);
  }

  if (toModerate.length) {
    console.log(`\nDEMOTE owner -> moderator (${toModerate.length}):`);
    for (const d of toModerate) console.log(`  ${d.email}  (${d.id})`);
  }

  if (purge.length) {
    console.log(`\nDELETE account (${purge.length}) -- irreversible, cascades:`);
    for (const d of purge) console.log(`  ${d.email}  (${d.id})`);
  }

  // Report what the doomed accounts actually hold, so nobody deletes a member
  // with a post history on the strength of a name alone.
  if (purge.length) {
    const { rows: fks } = await pool.query(
      `SELECT tc.table_name, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'User'
          AND tc.table_schema = 'public'`
    );
    const purgeIds = purge.map((d) => d.id);
    console.log("\n  What they hold:");
    let found = 0;
    for (const f of fks) {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM "${f.table_name}" WHERE "${f.column_name}" = ANY($1::text[])`,
        [purgeIds]
      );
      if (rows[0].n > 0) {
        found += 1;
        console.log(`    ${f.table_name}.${f.column_name}: ${rows[0].n}`);
      }
    }
    if (!found) console.log("    (nothing)");
  }

  if (dormant.length && !purgeDormant) {
    console.log(
      `\n  ! ${dormant.length} dormant account(s) would become moderators:\n` +
        `    credentials nobody is monitoring holding rights to delete any\n` +
        `    comment, pin messages and post announcements. Re-run with\n` +
        `    --purge-dormant to delete them instead of demoting.`
    );
  }

  if (toModerate.length === 0 && purge.length === 0) {
    console.log("\nNothing to change. Already limited to the allowlist.");
    process.exit(0);
  }

  const statements = [
    ...(toModerate.length
      ? [
          `UPDATE "User" SET "role" = 'moderator', "roleLabel" = 'Moderator' WHERE "id" = ANY($1::text[])`,
          `  -- ids: ${toModerate.map((d) => `"${d.id}"`).join(", ")}`,
        ]
      : []),
    ...(purge.length
      ? [
          `DELETE FROM "User" WHERE "id" = ANY($1::text[])`,
          `  -- ids: ${purge.map((d) => `"${d.id}"`).join(", ")}`,
        ]
      : []),
  ];

  if (!apply) {
    console.log(`\nDRY RUN. Statements that would run:\n\n  ${statements.join("\n  ")}`);
    console.log(`\nRe-run with --apply to execute.`);
    process.exit(0);
  }

  // Back up before writing. Roles are one string, but a deleted account cannot
  // be reconstructed -- the backup is the only way back.
  const backup = owners.map((o) => ({
    id: o.id,
    name: o.name,
    email: o.email,
    role: o.role,
    roleLabel: o.roleLabel,
    plan: o.plan,
  }));
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  console.log(`\nBackup written: ${backupFile}`);

  const { rows: operatorRows } = await pool.query(
    `SELECT id, name FROM "User" WHERE lower(email) = lower($1)`,
    [OPERATOR_EMAIL]
  );
  const actorId = operatorRows[0]?.id || "";
  const actorName = operatorRows[0]?.name || "";

  const client = await pool.connect();
// Deleting a User row is blocked by every foreign key that does NOT cascade.
// Follow and Notification are the ones that bite in practice -- Follow declares
// plain relations with no onDelete, so it defaults to restricting. Rather than
// hardcode today's tables, ask the catalog which relations restrict and clear
// those first, so the script stays correct as the schema grows.
//
// When deleting a member through the app, prefer src/lib/server/delete-member-data.js
// (deleteMemberData): it is the canonical, curated, ordered teardown used by
// PATCH/DELETE /api/admin/members/[id]. This is the standalone equivalent for
// the case where the admin UI has not shipped that action yet.
async function deleteUsersWithDependents(client, ids) {
  const { rows: fks } = await client.query(
    `SELECT tc.table_name, kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'User'
        AND tc.table_schema = 'public'
        AND tc.table_name <> 'User'`
  );

  // Restricting = no CASCADE rule on the constraint.
  const { rows: cascadeCols } = await client.query(
    `SELECT ccu.table_name AS child, kcu.column_name AS col
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
       JOIN information_schema.referential_constraints rc
         ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'User'
        AND tc.table_schema = 'public' AND rc.delete_rule = 'CASCADE'`
  );
  const cascading = new Set(cascadeCols.map((r) => `${r.child}.${r.col}`));

  for (const f of fks) {
    const key = `${f.table_name}.${f.column_name}`;
    if (cascading.has(key)) continue;
    const { rowCount } = await client.query(
      `DELETE FROM "${f.table_name}" WHERE "${f.column_name}" = ANY($1::text[])`,
      [ids]
    );
    if (rowCount) console.log(`  - cleared ${rowCount} row(s) from ${key}`);
  }
}

try {
    await client.query("BEGIN");

    if (toModerate.length) {
      await client.query(
        `UPDATE "User" SET "role" = 'moderator', "roleLabel" = 'Moderator' WHERE "id" = ANY($1::text[])`,
        [toModerate.map((d) => d.id)]
      );
    }

    if (purge.length) {
      // Remove the Supabase auth identity too, otherwise the credentials still
      // authenticate while the profile row is gone -- an orphaned login.
      //
      // Ids here are cuids, not the UUIDs Supabase Auth keys on, so a direct
      // deleteUser(id) throws. Same guard as api/admin/members/[id]/route.js:
      // delete by id only when it is genuinely a UUID, otherwise resolve the
      // auth user by exact email and remove that.
      const url = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const SUPABASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (url && serviceKey) {
        const { createClient } = await import("@supabase/supabase-js");
        const supabaseAdmin = createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        let byEmail = new Map();
        const needsLookup = purge.filter((d) => !SUPABASE_UUID.test(d.id));
        if (needsLookup.length) {
          let page = 1;
          while (page <= 5) {
            const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
            if (error) {
              console.log(`  ! could not list auth users: ${error.message}`);
              break;
            }
            for (const u of data?.users || []) byEmail.set((u.email || "").toLowerCase(), u.id);
            if (!data?.users?.length) break;
            page += 1;
          }
        }

        for (const d of purge) {
          const authId = SUPABASE_UUID.test(d.id) ? d.id : byEmail.get((d.email || "").toLowerCase());
          if (!authId) {
            console.log(`  - ${d.email}: no Supabase auth user, Postgres row only`);
            continue;
          }
          const { error } = await supabaseAdmin.auth.admin.deleteUser(authId);
          if (error) console.log(`  ! supabase auth delete failed for ${d.email}: ${error.message}`);
          else console.log(`  - ${d.email}: auth identity removed`);
        }
      } else {
        console.log("  ! SUPABASE_URL / SERVICE_ROLE_KEY missing -- auth identities left behind");
      }
      await deleteUsersWithDependents(client, purge.map((d) => d.id));
      await client.query(`DELETE FROM "User" WHERE "id" = ANY($1::text[])`, [purge.map((d) => d.id)]);
    }

    // The admin API logs role changes; a direct DB write would leave no trace,
    // so write the same trail by hand. metadata records the previous role,
    // matching the shape logAudit() produces in the API path.
    const trail = [
      ...toModerate.map((d) => ({ row: d, action: "member.role_changed", meta: { role: "moderator", prevRole: "owner" } })),
      ...purge.map((d) => ({ row: d, action: "member.deleted", meta: { prevRole: "owner", deletedVia: "limit-owners.mjs" } })),
    ];
    for (const t of trail) {
      await client.query(
        `INSERT INTO "AuditLog" (id, "actorId", "actorName", action, "targetId", metadata, "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, now())`,
        [
          `al_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
          actorId,
          actorName,
          t.action,
          t.row.id,
          JSON.stringify({ ...t.meta, via: "limit-owners.mjs" }),
        ]
      );
    }

    await client.query("COMMIT");
    console.log(
      `\nCommitted. ${toModerate.length} demoted, ${purge.length} deleted, ${trail.length} audit row(s) written.`
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`\nRolled back, nothing written: ${err.message}`);
    process.exitCode = 1;
  } finally {
    client.release();
  }

  // Verify from the database rather than trusting the update count.
  const { rows: after } = await pool.query(
    `SELECT email, role FROM "User" WHERE role IN ('owner','moderator') ORDER BY role, email`
  );
  console.log(`\nAfter -- owners:`);
  for (const r of after.filter((r) => r.role === "owner")) console.log(`  ${r.email}`);
  console.log(`Moderators (${after.filter((r) => r.role === "moderator").length}):`);
  for (const r of after.filter((r) => r.role === "moderator")) console.log(`  ${r.email}`);

  console.log(`\nTo reverse, restore "role"/"roleLabel" from ${backupFile}`);
} finally {
  await pool.end();
}
