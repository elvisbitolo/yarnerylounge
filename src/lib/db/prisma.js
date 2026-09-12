import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

// Shared singleton Prisma client (Postgres via Supabase). The driver adapter
// handles the connection; DATABASE_URL points at the Supabase pooler. In
// development, hot-reload can create many instances, so we reuse a single one.
// Prefer `POSTGRES_PRISMA_URL` (the name Vercel/Supabase integrations use)
// whenever DATABASE_URL is not set.
//
// Construction is lazy (via getPrisma) and returns null when no connection
// string is configured, so importing this module never crashes a route — callers
// decide how to degrade.
const globalForPrisma = globalThis;

function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || "";
}

function createClient() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl(),
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