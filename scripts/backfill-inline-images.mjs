// Backfill inline base64 images in Postgres into Vercel Blob storage.
//
// Post images used to be stored as data:image/...;base64 URLs directly in the
// Post.imageUrl column, which made every read of that row transfer hundreds of
// kilobytes. The feed composer now uploads to /api/upload?kind=post instead, so
// this only affects rows that already exist.
//
// Usage:
//   node --env-file=.env.local scripts/backfill-inline-images.mjs            # dry run
//   node --env-file=.env.local scripts/backfill-inline-images.mjs --apply    # writes
//
// Requires a real BLOB_READ_WRITE_TOKEN to actually write. A dry run touches
// neither the database nor blob storage: it only prints what it would do.

import pg from "pg";

const APPLY = process.argv.includes("--apply");

try {
  process.loadEnvFile(".env.local");
} catch {
  // no local env file; rely on the ambient environment
}

const token = process.env.BLOB_READ_WRITE_TOKEN || "";
if (APPLY && (!token || token.startsWith("[") || token.length < 20)) {
  console.error("BLOB_READ_WRITE_TOKEN is missing or looks like a placeholder.");
  console.error("A dry run needs no token; re-run with --apply once it is set.");
  process.exit(1);
}

const url =
  process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || "";
if (!url) {
  console.error("No DATABASE_URL or POSTGRES_PRISMA_URL set.");
  process.exit(1);
}

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif" };

function decodeDataUrl(dataUrl) {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const meta = dataUrl.slice(0, comma);
  const mime = /^data:(image\/[a-z+]+);base64$/i.exec(meta)?.[1]?.toLowerCase();
  if (!mime || !EXT[mime]) return null;
  const buf = Buffer.from(dataUrl.slice(comma + 1), "base64");
  if (!buf.length) return null;
  return { mime, ext: EXT[mime], buf };
}

// Imported only when writing, so a dry run works without the dependency or token.
const { put } = APPLY ? await import("@vercel/blob") : { put: null };
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows } = await client.query(
  `SELECT id, "authorId", "imageUrl" FROM "Post"
    WHERE "imageUrl" LIKE 'data:%' ORDER BY "createdAt" ASC`
);

console.log(`${APPLY ? "APPLY" : "DRY RUN"}: ${rows.length} post(s) with inline base64 images\n`);
if (!rows.length) {
  const { rows: users } = await client.query(
    `SELECT
       count(*) FILTER (WHERE "photoURL" LIKE 'data:%')     AS photo,
       count(*) FILTER (WHERE "coverPhotoURL" LIKE 'data:%') AS cover
     FROM "User"`
  );
  console.log("No inline post images left. User columns still holding base64:", users[0]);
  await client.end();
  process.exit(0);
}

let done = 0;
let skipped = 0;
let bytes = 0;

for (const row of rows) {
  const decoded = decodeDataUrl(row.imageUrl);
  if (!decoded) {
    console.log(`  SKIP ${row.id}: not a recognised base64 image url`);
    skipped++;
    continue;
  }
  const pathname = `uploads/post/${row.authorId}/${Date.now()}-${row.id.slice(-6)}.${decoded.ext}`;
  try {
    // Dry run must not write: calling put() here would create a real blob for
    // every row on every preview, and addRandomSuffix would orphan each one.
    const target = APPLY
      ? (
          await put(pathname, decoded.buf, {
            access: "public",
            contentType: decoded.mime,
            addRandomSuffix: true,
            token,
          })
        ).url
      : `${pathname}?s=<random>`;
    if (APPLY) {
      await client.query(`UPDATE "Post" SET "imageUrl" = $1 WHERE id = $2`, [target, row.id]);
    }
    bytes += decoded.buf.length;
    done++;
    console.log(
      `  ${APPLY ? "moved" : "would move"} ${row.id}  ${(decoded.buf.length / 1024).toFixed(0)}KB -> ${target}`
    );
  } catch (err) {
    console.error(`  FAIL  ${row.id}: ${err.message}`);
    skipped++;
  }
}

console.log(
  `\n${APPLY ? "moved" : "would move"} ${done}, skipped ${skipped}, ${(bytes / 1024 / 1024).toFixed(2)}MB total`
);
if (!APPLY) {
  console.log("Dry run: no database rows and no blobs were written.");
  console.log("Re-run with --apply to write these changes.");
}

await client.end();
