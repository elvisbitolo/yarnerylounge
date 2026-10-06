-- Terms of Service consent (Option B): an account may be created before consent
-- is given, but nothing in the app is usable until the member ticks the box.
--
-- `tosAcceptedAt` is the moment of consent; `tosVersion` is the ToS revision it
-- was given against, so a future revision can be re-collected deliberately
-- instead of silently inheriting the old acceptance.
--
-- The back-fill is the grandfather clause. Every account that exists today predates
-- the consent screen and must keep working the moment this ships, so consent is
-- recorded for all of them at migrate time. needsTosConsent() also treats any
-- account created before TOS_CONSENT_SINCE as already covered, which means an
-- out-of-order deploy (code first, migration second) fails open rather than
-- locking the whole member base out of their own accounts.
ALTER TABLE "User"
    ADD COLUMN "tosAcceptedAt" TIMESTAMP(3),
    ADD COLUMN "tosVersion" TEXT;

UPDATE "User"
SET "tosAcceptedAt" = NOW(),
    "tosVersion" = 'grandfathered'
WHERE "tosAcceptedAt" IS NULL;
