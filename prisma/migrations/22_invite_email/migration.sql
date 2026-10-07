-- 22_invite_email
-- An optional "send the link to this address" field on invites. No uniqueness
-- or FK: it's a CTA convenience, not an identity gate — anyone holding the
-- token can still claim the invite.
ALTER TABLE "Invitation" ADD COLUMN "recipientEmail" TEXT;