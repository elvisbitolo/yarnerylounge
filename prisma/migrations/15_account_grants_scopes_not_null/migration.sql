-- AccountGrant.scopes is String[] in schema.prisma (non-null), but 10_account_grants
-- created the column as a nullable TEXT[] with a default. Postgres will happily
-- store NULL there, and Prisma would then return null for a field typed as
-- string[]. Tighten it to match the declared type.
--
-- The table is empty at the time of writing, so there is no NULL to clean up.
ALTER TABLE "AccountGrant" ALTER COLUMN "scopes" SET NOT NULL;
