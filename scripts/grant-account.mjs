// Grants one member the ability to act as another's account.
//
//   node scripts/grant-account.mjs <principal-email> <grantee-email>
//   node scripts/grant-account.mjs --revoke <principal-email> <grantee-email>
//
// Prints what it will do and exits unless --apply is also passed, because this
// hands over owner rights and there is no undo beyond revoking the grant.
//
// The grantee keeps their own login and their own Session row. Only the identity
// the app resolves for them changes, so revoking the grant takes effect on their
// next request — there are no sessions to clean up.

import fs from "fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const revoke = args.includes("--revoke");
const [principalEmail, granteeEmail] = args.filter((a) => !a.startsWith("--"));

if (!principalEmail || !granteeEmail) {
  console.error(
    "Usage: node scripts/grant-account.mjs [--revoke] [--apply] <principal-email> <grantee-email>"
  );
  process.exit(1);
}

const url = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
if (!url) {
  console.error("Missing DATABASE_URL in .env.local");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function findByEmail(email) {
  // findFirst, not findUnique: User.email has no unique constraint, and several
  // addresses are duplicated. Refuse to guess if that is true here.
  const rows = await prisma.user.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, name: true, role: true },
  });
  if (rows.length === 0) {
    console.error(`No member found with email ${email}`);
    process.exit(1);
  }
  if (rows.length > 1) {
    console.error(
      `${email} matches ${rows.length} member rows, so the grant would be ambiguous:\n` +
        rows.map((r) => `  ${r.id}  ${r.name}  (${r.role})`).join("\n") +
        "\n\nResolve the duplicate first, then re-run."
    );
    process.exit(1);
  }
  return rows[0];
}

try {
  const principal = await findByEmail(principalEmail);
  const grantee = await findByEmail(granteeEmail);

  if (principal.id === grantee.id) {
    console.error("A member cannot be granted their own account.");
    process.exit(1);
  }

  const existing = await prisma.accountGrant.findFirst({
    where: { principalId: principal.id, granteeId: grantee.id },
  });

  if (revoke) {
    if (!existing || existing.revokedAt) {
      console.log("No active grant to revoke. Nothing to do.");
      process.exit(0);
    }
    console.log(`Would revoke: ${grantee.email} acting as ${principal.email}`);
    if (!apply) {
      console.log("\nDry run. Re-run with --apply to make it so.");
      process.exit(0);
    }
    await prisma.accountGrant.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), revokedBy: principal.id },
    });
    console.log("Revoked. It takes effect on their next request.");
    process.exit(0);
  }

  if (existing && !existing.revokedAt) {
    console.log(`Already active: ${grantee.email} acts as ${principal.email}`);
    process.exit(0);
  }

  console.log(`Would grant: ${grantee.email} may act as ${principal.email}`);
  console.log(`  principal ${principal.id}  ${principal.name}  (${principal.role})`);
  console.log(`  grantee   ${grantee.id}  ${grantee.name}  (${grantee.role})`);
  console.log("\nThey keep their own login and password. Revoke to undo.");
  if (!apply) {
    console.log("Dry run. Re-run with --apply to make it so.");
    process.exit(0);
  }

  if (existing) {
    await prisma.accountGrant.update({
      where: { id: existing.id },
      data: { revokedAt: null, revokedBy: null, createdAt: new Date() },
    });
  } else {
    await prisma.accountGrant.create({
      data: { principalId: principal.id, granteeId: grantee.id, scopes: ["act"] },
    });
  }
  console.log("Granted.");
} finally {
  await prisma.$disconnect();
}
