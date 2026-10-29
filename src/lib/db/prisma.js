import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

// Shared singleton Prisma client (Postgres via Supabase). In serverless, every
// warm function instance can own a pool, so the per-instance pool must be small
// and idle connections must be released promptly. Otherwise a burst of routes
// can multiply the default pg pool size until Supabase's project-wide cap is hit.
const globalForPrisma = globalThis;

function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || "";
}

function poolMax() {
  const configured = Number.parseInt(process.env.DATABASE_POOL_MAX || "3", 10);
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, 10) : 3;
}

function createClient() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl(),
      max: poolMax(),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      allowExitOnIdle: true,
    }),
  });
}

export function getPrisma() {
  if (!databaseUrl()) return null;
  if (!globalForPrisma.__prisma) {
    globalForPrisma.__prisma = createClient();
  }
  return globalForPrisma.__prisma;
}

export default getPrisma;
