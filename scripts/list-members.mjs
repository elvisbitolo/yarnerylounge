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

const { default: pg } = await import("pg");
const pool = new pg.Pool({
  connectionString:
    process.env.DIRECT_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL,
});

const res = await pool.query(`
  SELECT u.id, u.email, u.name, u.role, u.plan, s.plan as splan, s.tier, s.status
  FROM "User" u
  LEFT JOIN "Subscription" s ON s.id = u.id OR s."userId" = u.id
  ORDER BY u."createdAt" DESC NULLS LAST
`);
for (const r of res.rows) {
  console.log(`${r.email || 'no-email'}\t${r.name || ''}\trole=${r.role}\tplan(u)=${r.plan}\tsub(plan=${r.splan},tier=${r.tier},status=${r.status})\tid=${r.id}`);
}
await pool.end();
