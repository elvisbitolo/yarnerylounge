/* Re-mux stored recordings so the MP4 `moov` atom sits before `mdat`.
 *
 * JaaS writes progressive MP4s with the index (`moov`) at the end. Browsers can
 * still play them, but they must fetch the tail before the first frame, which
 * makes playback start slower and makes client-side thumbnail capture pull far
 * more data than a single frame needs.
 *
 * This script runs outside the serverless runtime (GitHub Actions or a machine
 * with ffmpeg) because remuxing a multi-GB file needs more disk/time than a
 * Vercel function has. It is idempotent: already-faststart files are detected
 * by parsing the first top-level boxes and skipped.
 *
 * Usage:
 *   node scripts/faststart-recordings.mjs [--limit N] [--dry-run] [--id ID]
 *
 * Required env:
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)
 *   DIRECT_URL / POSTGRES_URL_NON_POOLING / DATABASE_URL / POSTGRES_PRISMA_URL
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

import { execFile } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, open, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const execFileAsync = promisify(execFile);

const PROBE_BYTES = 256 * 1024;
const INT_MAX = 2_147_483_647;

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const connectionString =
  process.env.DIRECT_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL;

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const hasFlag = (flag) => process.argv.includes(flag);

const dryRun = hasFlag("--dry-run");
const onlyId = argValue("--id");
const limit = Math.max(
  1,
  Number(argValue("--limit") || process.env.FASTSTART_LIMIT || 5) || 5
);

function skip(reason) {
  console.log(`Skipping: ${reason}`);
  process.exit(0);
}

if (!supabaseUrl || !serviceRoleKey) {
  skip("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured");
}
if (!connectionString) {
  skip("no Postgres connection string is configured");
}

try {
  await execFileAsync("ffmpeg", ["-version"]);
} catch {
  console.error("ffmpeg is required but was not found on PATH");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const pool = new pg.Pool({ connectionString });

/** Return true when the second top-level box (after ftyp) is moov. */
function isFaststartBuffer(buffer) {
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > buffer.length) return false;
      size = Number(buffer.readBigUInt64BE(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = buffer.length - offset;
    }
    if (type === "moov") return true;
    if (type === "mdat") return false;
    if (!Number.isFinite(size) || size < header) return false;
    offset += size;
    if (offset > PROBE_BYTES) return false;
  }
  // A file whose header layout we cannot read is left alone; ffmpeg would still
  // remux it, but a false negative costs a full download for no reason.
  return false;
}

async function probeUrl(url) {
  const res = await fetch(url, {
    headers: { Range: `bytes=0-${PROBE_BYTES - 1}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok || !res.body) throw new Error(`probe_failed_${res.status}`);
  if (res.status !== 206) {
    // The server ignored Range. Read a bounded prefix and cancel the rest.
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    while (total < PROBE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      total += value.byteLength;
    }
    await reader.cancel().catch(() => {});
    return isFaststartBuffer(Buffer.concat(chunks));
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return isFaststartBuffer(buffer);
}

async function probeFile(filePath) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(PROBE_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, PROBE_BYTES, 0);
    return isFaststartBuffer(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

async function download(url, destination) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`download_failed_${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destination));
}

async function upload(bucket, storagePath, filePath) {
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  const info = await stat(filePath);
  const res = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${bucket}/${encodedPath}`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "video/mp4",
        "content-length": String(info.size),
        "x-upsert": "true",
      },
      body: Readable.toWeb(createReadStream(filePath)),
      duplex: "half",
      signal: AbortSignal.timeout(20 * 60_000),
    }
  );
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`upload_failed_${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return info.size;
}

async function remux(input, output) {
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-i",
      input,
      "-map",
      "0",
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      output,
    ],
    { maxBuffer: 4 * 1024 * 1024, timeout: 45 * 60_000 }
  );
}

const rows = onlyId
  ? (
      await pool.query(
        `select id, title, "storageBucket", "storagePath", "sizeBytes"
           from "Recording"
          where id = $1 and "storagePath" is not null`,
        [onlyId]
      )
    ).rows
  : (
      await pool.query(
        `select id, title, "storageBucket", "storagePath", "sizeBytes"
           from "Recording"
          where "storagePath" is not null
            and "deletedAt" is null
            and "storagePath" not like '%.webm'
          order by "createdAt" desc`
      )
    ).rows;

const bucket = "recordings";
const candidates = [];
let scanned = 0;

for (const row of rows) {
  scanned += 1;
  let faststart = false;
  try {
    const { data, error } = await admin.storage
      .from(row.storageBucket || bucket)
      .createSignedUrl(row.storagePath, 60 * 60);
    if (error || !data?.signedUrl) throw new Error(error?.message || "no_url");
    faststart = await probeUrl(data.signedUrl);
  } catch (error) {
    console.error(`FAIL probe ${row.id}: ${error?.message || error}`);
    continue;
  }
  if (faststart) {
    console.log(`ok    ${row.id} already faststart`);
    continue;
  }
  candidates.push(row);
  if (candidates.length >= limit) break;
}

console.log(
  `Scanned ${scanned} of ${rows.length} recording(s); ` +
    `${candidates.length} need faststart` +
    (dryRun ? " (dry run)" : "")
);

if (dryRun) {
  for (const row of candidates) {
    console.log(`would remux ${row.id} ${row.title || row.storagePath}`);
  }
  await pool.end();
  process.exit(0);
}

const workDir = await mkdtemp(path.join(tmpdir(), "faststart-"));
let changed = 0;
const failures = [];

try {
  for (const [index, row] of candidates.entries()) {
    const label = `${index + 1}/${candidates.length} ${row.id}`;
    const targetBucket = row.storageBucket || bucket;
    const input = path.join(workDir, `${row.id}-in.mp4`);
    const output = path.join(workDir, `${row.id}-out.mp4`);
    try {
      const { data, error } = await admin.storage
        .from(targetBucket)
        .createSignedUrl(row.storagePath, 60 * 60);
      if (error || !data?.signedUrl) throw new Error(error?.message || "no_url");

      console.log(`${label}: downloading`);
      await download(data.signedUrl, input);

      console.log(`${label}: remuxing`);
      await remux(input, output);

      if (!(await probeFile(output))) {
        throw new Error("remux_output_not_faststart");
      }
      const size = (await stat(output)).size;
      if (!size) throw new Error("remux_output_empty");

      console.log(`${label}: uploading ${(size / 1024 ** 2).toFixed(1)} MB`);
      await upload(targetBucket, row.storagePath, output);

      await pool.query(
        `update "Recording"
            set "sizeBytes" = $2,
                "sizeUnknown" = $3,
                "updatedAt" = now()
          where id = $1`,
        [row.id, Math.min(size, INT_MAX), size > INT_MAX]
      );

      changed += 1;
      console.log(`${label}: done`);
    } catch (error) {
      failures.push({ id: row.id, message: error?.message || String(error) });
      console.error(`${label}: FAIL ${error?.message || error}`);
    } finally {
      await rm(input, { force: true });
      await rm(output, { force: true });
    }
  }
} finally {
  await rm(workDir, { recursive: true, force: true });
  await pool.end();
}

console.log(`Faststart complete: ${changed} remuxed, ${failures.length} failed`);
if (failures.length) {
  for (const failure of failures) {
    console.error(`  ${failure.id}: ${failure.message}`);
  }
  process.exit(1);
}
