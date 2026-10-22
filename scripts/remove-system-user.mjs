// Removes the synthetic "system" member.
//
//   node scripts/remove-system-user.mjs            (dry run, prints the plan)
//   node scripts/remove-system-user.mjs --apply    (repaints the posts, deletes the row)
//
// The pinned Terms of Service announcement used to be authored by a "system"
// user row. That row was a real member: it showed up in the public directory,
// in the @mention list and in the member counts. Post.authorId is nullable
// now, so the announcement is authored by nobody instead.
//
// Order matters. Post_authorId_fkey is ON DELETE RESTRICT, so the posts have
// to be repointed before the account can go. Everything runs in one
// transaction: if any other table still points at the account, the delete
// fails and nothing is written.

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

const APPLY = process.argv.includes("--apply");
const SYSTEM_ID = "system";

const { default: pg } = await import("pg");
const pool = new pg.Pool({
  connectionString:
    process.env.DIRECT_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL,
});

try {
  const user = await pool.query(
    'SELECT id, email, name, role, suspended FROM "User" WHERE id = $1',
    [SYSTEM_ID]
  );
  if (user.rowCount === 0) {
    console.log("Nothing to do: no 'system' user row.");
    await pool.end();
    process.exit(0);
  }
  console.log("Account:", user.rows[0]);

  // Every column that points at a member, so a leftover reference is reported
  // before anything is deleted.
  const fks = await pool.query(`
    SELECT c.relname AS table_name, a.attname AS column_name
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
    WHERE con.contype = 'f' AND con.confrelid = '"User"'::regclass
    ORDER BY c.relname, a.attname
  `);

  const references = [];
  for (const fk of fks.rows) {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM "${fk.table_name}" WHERE "${fk.column_name}" = $1`,
      [SYSTEM_ID]
    );
    if (rows[0].n > 0) {
      references.push({ ...fk, count: rows[0].n });
    }
  }

  if (references.length === 0) {
    console.log("\nNo row points at the account any more.");
  }

  console.log("\nRows pointing at the account:");
  for (const ref of references) {
    console.log(`  ${ref.table_name}.${ref.column_name}: ${ref.count}`);
  }
  if (references.length === 0) console.log("  (none)");

  const postRefs = references.find((r) => r.table_name === "Post" && r.column_name === "authorId");
  const others = references.filter((r) => r !== postRefs);
  if (others.length > 0) {
    console.log(
      "\nRefusing to run: rows outside Post.authorId still point at the account."
    );
    console.log("Those columns are NOT NULL, so the account cannot be deleted.");
    await pool.end();
    process.exit(1);
  }

  const posts = await pool.query(
    'SELECT id, kind, pinned FROM "Post" WHERE "authorId" = $1 ORDER BY id',
    [SYSTEM_ID]
  );
  console.log("\nPosts to repoint to no author:");
  if (posts.rowCount === 0) console.log("  (none)");
  for (const row of posts.rows) console.log(`  ${row.id} (kind=${row.kind}, pinned=${row.pinned})`);

  if (!APPLY) {
    console.log("\nDry run. Nothing was written. Re-run with --apply to make the change.");
    await pool.end();
    process.exit(0);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query('UPDATE "Post" SET "authorId" = NULL WHERE "authorId" = $1', [SYSTEM_ID]);
    const deleted = await client.query('DELETE FROM "User" WHERE id = $1 RETURNING id', [SYSTEM_ID]);
    await client.query("COMMIT");
    console.log(`\n✓ Repointed ${posts.rowCount} post(s) and deleted ${deleted.rowCount} account row.`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("\n✗ Nothing was written:", err.message);
    // release(true) destroys the connection: after a failed transaction it may
    // be in an unknown state, and returning it to the pool would poison it.
    client.release(true);
    process.exit(1);
  }
  // release(), not end(): the client came from the pool, and ending it leaves
  // the pool waiting on a connection it still believes is checked out, so the
  // final pool.end() never settles.
  client.release();

  const after = await pool.query('SELECT count(*)::int AS n FROM "User" WHERE id = $1', [SYSTEM_ID]);
  const orphanPosts = await pool.query('SELECT count(*)::int AS n FROM "Post" WHERE "authorId" = $1', [SYSTEM_ID]);
  console.log(`✓ Accounts left: ${after.rows[0].n}, posts still pointing at it: ${orphanPosts.rows[0].n}`);
} catch (e) {
  console.error("Error:", e.message);
  // A failed run must not exit 0, or a caller cannot tell it apart from success.
  process.exitCode = 1;
} finally {
  await pool.end();
}
