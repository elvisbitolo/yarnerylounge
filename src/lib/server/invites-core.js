import { randomBytes } from "node:crypto";

// Refer-a-member invites. A member hands their personal link to someone
// outside the community; the token is single-use, expires after a week, and
// can be revoked. The payout is deliberately deferred to *activation* (the
// invitee's first published post), so a burst of empty account creations earns
// nothing — points follow real participation.
export const INVITE_TTL_MS = 7 * 86400000;
export const MAX_OUTSTANDING_INVITES = 10;
export const MAX_INVITES_PER_DAY = 5;
export const RECIPIENT_NAME_MAX = 60;
export const INVITE_MESSAGE_MAX = 280;

// URL-safe opaque token. 18 random bytes -> 24 base64url chars, unguessable.
export function generateInviteToken() {
  return randomBytes(18).toString("base64url");
}

function toTime(v) {
  if (v == null) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? 0 : t;
}

// "Expired" is derived state: a pending invite whose deadline has passed reads
// as expired everywhere without a state column or a sweeper job. A pending
// invite with no deadline at all (shouldn't happen — createInvite always sets
// one) is never forced expired; failing open beats silently killing a link.
export function isExpired(row, now = Date.now()) {
  if (row?.status !== "pending") return false;
  if (row.expiresAt == null) return false;
  return toTime(row.expiresAt) <= now;
}

export function mapInviteRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    token: row.token,
    inviterUid: row.inviterUid,
    recipientName: row.recipientName || "",
    message: row.message || "",
    status: row.status,
    expiresAt: row.expiresAt ? new Date(toTime(row.expiresAt)) : null,
    acceptedAt: row.acceptedAt ? new Date(toTime(row.acceptedAt)) : null,
    acceptedUid: row.acceptedUid || "",
    activatedAt: row.activatedAt ? new Date(toTime(row.activatedAt)) : null,
    createdAt: row.createdAt ? new Date(toTime(row.createdAt)) : null,
    expired: isExpired(row),
  };
}

// Public meta for a landing page. Deliberately leaks nothing beyond what is
// already in the URL: no token, no inviter uid, no accepted-uid/attribution.
export function mapPublicInvite(row) {
  const mapped = mapInviteRow(row);
  if (!mapped) return null;
  return {
    recipientName: mapped.recipientName,
    message: mapped.message,
    status: mapped.status,
    expired: mapped.expired,
    createdAt: mapped.createdAt,
  };
}

export async function createInvite({ prisma, inviterUid, recipientName = "", message = "" }) {
  const cleanName = (typeof recipientName === "string" ? recipientName : "").trim();
  const cleanMessage = (typeof message === "string" ? message : "").trim();

  if (cleanName.length > RECIPIENT_NAME_MAX) {
    return { ok: false, error: "recipient_name_too_long", message: `Names are ${RECIPIENT_NAME_MAX} characters max.` };
  }
  if (cleanMessage.length > INVITE_MESSAGE_MAX) {
    return { ok: false, error: "message_too_long", message: `Notes are ${INVITE_MESSAGE_MAX} characters max.` };
  }
  if (!prisma) return { ok: false, error: "server_error", message: "Could not reach the database." };

  const now = new Date();
  const outstandingCount = await prisma.invitation.count({
    where: {
      inviterUid,
      status: "pending",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
  if (outstandingCount >= MAX_OUTSTANDING_INVITES) {
    return {
      ok: false,
      error: "invite_limit",
      message: `You can have ${MAX_OUTSTANDING_INVITES} active invites at once — revoke one or wait for someone to accept.`,
    };
  }

  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const todayCount = await prisma.invitation.count({
    where: { inviterUid, createdAt: { gte: startOfDay } },
  });
  if (todayCount >= MAX_INVITES_PER_DAY) {
    return {
      ok: false,
      error: "daily_limit",
      message: `You've sent ${MAX_INVITES_PER_DAY} invites today — come back tomorrow.`,
    };
  }

  const token = generateInviteToken();
  const row = await prisma.invitation.create({
    data: {
      token,
      inviterUid,
      recipientName: cleanName || null,
      message: cleanMessage || "",
      status: "pending",
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
      createdAt: now,
    },
  });
  return { ok: true, invite: mapInviteRow(row) };
}

export async function listInvites({ prisma, inviterUid }) {
  if (!prisma) return [];
  const rows = await prisma.invitation.findMany({
    where: { inviterUid },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map(mapInviteRow);
}

export async function getPublicInvite({ prisma, token }) {
  if (!prisma) return null;
  const row = await prisma.invitation.findUnique({
    where: { token },
    include: { inviter: { select: { id: true, name: true, photoURL: true } } },
  });
  if (!row) return null;
  return {
    ...mapPublicInvite(row),
    inviter: {
      uid: row.inviter?.id || "",
      name: row.inviter?.name || "a community member",
      photoURL: row.inviter?.photoURL || "",
    },
  };
}

export async function claimInvite({ prisma, token, claimerUid }) {
  if (!prisma) return { ok: false, error: "server_error", message: "Could not reach the database." };
  const row = await prisma.invitation.findUnique({ where: { token } });
  if (!row) {
    return { ok: false, error: "not_found", message: "This invite doesn't exist." };
  }
  if (row.inviterUid === claimerUid) {
    return { ok: false, error: "self_invite", message: "That's your own invite link — share it with someone else." };
  }
  if (row.status === "revoked") {
    return { ok: false, error: "revoked", message: "This invite was revoked." };
  }
  if (row.status === "accepted") {
    return { ok: false, error: "already_claimed", message: "This invite has already been claimed." };
  }
  if (isExpired(row)) {
    return { ok: false, error: "expired", message: "This invite has expired." };
  }

  const acceptedAt = new Date();
  await prisma.invitation.update({
    where: { id: row.id },
    data: { status: "accepted", acceptedAt, acceptedUid: claimerUid },
  });
  return {
    ok: true,
    invite: {
      ...mapInviteRow(row),
      status: "accepted",
      acceptedAt,
      acceptedUid: claimerUid,
      expired: false,
    },
  };
}

export async function revokeInvite({ prisma, token, inviterUid }) {
  if (!prisma) return { ok: false, error: "server_error", message: "Could not reach the database." };
  const row = await prisma.invitation.findUnique({ where: { token } });
  if (!row || row.inviterUid !== inviterUid) {
    return { ok: false, error: "not_found", message: "Invite not found." };
  }
  if (row.status === "accepted") {
    return { ok: false, error: "already_claimed", message: "This invite was already accepted — they're in." };
  }
  if (row.status === "revoked") {
    return { ok: false, error: "already_revoked", message: "This invite was already revoked." };
  }
  await prisma.invitation.update({
    where: { id: row.id },
    data: { status: "revoked" },
  });
  return { ok: true };
}

// One-time payout when an accepted invitee publishes their first post. Both
// sides earn points; a racing double-publish is prevented by the `activatedAt`
// conditional update, so the reward can only clear once.
//
// The award amounts and the credit itself live in gamification.js (the single
// source of truth for POINTS). It is loaded lazily here so this module stays
// importable under plain node in the unit-test suite, which does not resolve
// the app's "@/..." alias. Tests inject a `credit` fn instead.
export async function rewardActivation({ prisma, authorUid, credit = null }) {
  if (!prisma) return { rewarded: false };
  const row = await prisma.invitation.findFirst({
    where: { acceptedUid: authorUid, status: "accepted", activatedAt: null },
  });
  if (!row) return { rewarded: false };

  const claimed = await prisma.invitation.updateMany({
    where: { id: row.id, activatedAt: null },
    data: { activatedAt: new Date() },
  });
  if (claimed.count !== 1) return { rewarded: false };

  const inviter = await prisma.user.findUnique({
    where: { id: row.inviterUid },
    select: { name: true },
  });
  const inviterName = inviter?.name || "Member";

  if (credit) {
    await credit(row.inviterUid, authorUid, inviterName);
  } else {
    const { awardPoints, POINTS } = await import("./gamification.js");
    await awardPoints(row.inviterUid, POINTS.INVITE_ACTIVATED, inviterName);
    await awardPoints(authorUid, POINTS.INVITE_ACTIVATED_JOINEE, "You");
  }
  return { rewarded: true, inviterUid: row.inviterUid };
}