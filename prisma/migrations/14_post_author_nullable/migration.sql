-- The pinned read-only announcement has no member author, so Post.authorId is
-- made nullable instead of inventing a service account in User.
--
-- The existing Post_authorId_fkey is left untouched: it is already ON DELETE
-- RESTRICT, and that behaviour is deliberate. Defaulting the now-optional
-- relation to SetNull would null out every post belonging to a deleted account,
-- and a post with no author would then be indistinguishable from the
-- announcement.
ALTER TABLE "Post" ALTER COLUMN "authorId" DROP NOT NULL;
