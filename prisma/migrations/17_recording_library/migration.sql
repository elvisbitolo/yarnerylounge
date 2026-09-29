-- Lounge recordings library.
--
-- Jitsi as a Service keeps a recording for only 24 hours, exposed through a
-- short-lived `preAuthenticatedLink` on the RECORDING_UPLOADED webhook. To make
-- recordings durable and playable from the site we copy the file into our own
-- private Supabase Storage bucket; this table is the durable index of what we
-- have pulled.
--
-- `idempotencyKey` is unique because JaaS documents that two deliveries
-- sharing a key are duplicates and the later one must be ignored — that makes
-- the webhook handler safe to retry without a separate dedupe table.
--
-- `sourceLink` is intentionally NOT a column here. It is a credential that
-- expires in 24h; the ingest worker reads it back out of the stored payload
-- only while `sourceExpiresAt` is still in the future.
CREATE TABLE "Recording" (
    "id"                 TEXT NOT NULL,
    "idempotencyKey"     TEXT NOT NULL,
    "jaasSessionId"      TEXT NOT NULL,
    "jaasRecordingId"    TEXT,

    "roomId"             TEXT,
    "roomName"           TEXT,
    "title"              TEXT NOT NULL DEFAULT '',
    "status"             TEXT NOT NULL DEFAULT 'pending',
    "share"              BOOLEAN NOT NULL DEFAULT false,

    "storageBucket"      TEXT,
    "storagePath"        TEXT,
    "sizeBytes"          INTEGER,
    "sizeUnknown"        BOOLEAN NOT NULL DEFAULT false,
    "durationSec"        INTEGER,
    "transcriptPath"     TEXT,
    "participants"       JSONB,
    "initiatorId"        TEXT,

    "startedAt"          TIMESTAMP(3),
    "endedAt"            TIMESTAMP(3),
    "sourceExpiresAt"    TIMESTAMP(3),
    "pulledAt"           TIMESTAMP(3),
    "attempts"           INTEGER NOT NULL DEFAULT 0,
    "lastError"          TEXT,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3),

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

-- Webhook dedupe. Also the lookup path for a retrying delivery.
CREATE UNIQUE INDEX "Recording_idempotencyKey_key" ON "Recording"("idempotencyKey");

-- Drives the per-lounge filter on the library page.
CREATE INDEX "Recording_roomId_createdAt_idx" ON "Recording"("roomId", "createdAt" DESC);

-- Drives the ingest sweep that retries pulls still inside the 24h window.
CREATE INDEX "Recording_status_idx" ON "Recording"("status");

-- Drives the library's default newest-first ordering.
CREATE INDEX "Recording_createdAt_idx" ON "Recording"("createdAt" DESC);

ALTER TABLE "Recording"
    ADD CONSTRAINT "Recording_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
