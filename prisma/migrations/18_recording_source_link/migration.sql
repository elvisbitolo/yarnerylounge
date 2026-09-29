-- Stores JaaS's short-lived `preAuthenticatedLink` so a failed pull can be
-- retried by the ingest sweep before the 24h window closes.
--
-- Without this the only chance to fetch the file is the single webhook
-- request; any transient failure would silently lose the recording forever.
--
-- This is a credential, not a shareable link: it grants read access to the
-- file for 24h. It is stored in a private column, is never serialised to a
-- client, and is nulled out as soon as the pull succeeds.
ALTER TABLE "Recording" ADD COLUMN "sourceLink" TEXT;
