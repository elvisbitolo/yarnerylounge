-- System author used by system-authored content (Welcome Vault post, scheduled
-- questions, group welcome posts, intro rooms) to satisfy the Post/Group/Room
-- foreign keys on "authorId"/"createdBy". Kept hidden from member-facing lists
-- via the suspended flag (and additionally filtered in /members + mentions).
INSERT INTO "User" ("id", "email", "name", "role", "suspended", "createdAt")
VALUES ('system', 'system@secret-yarnery-lounge.local', 'System', 'member', true, now())
ON CONFLICT ("id") DO NOTHING;