-- Recording thumbnails, intrinsic dimensions and the 30-day recycle bin.
--
-- Thumbnails are captured in the browser, not with ffmpeg: the serverless
-- runtime has no media toolchain, so the library seeks a ready recording ~3s
-- in and uploads a small JPEG. `thumbnailPath` is the object key in the same
-- private bucket as the video, and `width`/`height` come from the same video
-- element so a card can pick a 16:9 or 9:16 frame without re-probing the file.
--
-- `deletedAt`/`deletedBy` back the Trash: a delete is a soft delete first, the
-- row stays visible for 30 days with Undo, and the storage objects are purged
-- only once the window closes. `deletedBy` is a plain user id, not an FK, so
-- deleting the account cannot erase who removed a recording.
ALTER TABLE "Recording"
    ADD COLUMN "thumbnailPath" TEXT,
    ADD COLUMN "width" INTEGER,
    ADD COLUMN "height" INTEGER,
    ADD COLUMN "deletedAt" TIMESTAMP(3),
    ADD COLUMN "deletedBy" TEXT;

-- Drives the Trash purge sweep and lets the library exclude soft-deleted rows
-- without a sequential scan.
CREATE INDEX "Recording_deletedAt_idx" ON "Recording"("deletedAt");
