import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

// Accounts that may use the saved-account switcher. The allowlist gates the UI
// and every write path; the group scoping below is what actually stops one
// owner from reaching another owner's accounts.
const DEFAULT_SWITCH_EMAILS = [
  "secretyarnery@gmail.com",
  "elvisbitolo11@gmail.com",
];

export function switchOwnerEmails() {
  const configured = String(process.env.ACCOUNT_SWITCH_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_SWITCH_EMAILS;
}

// The root is the account that owns the group. A child account points at its
// creator; an owner account is its own root. One level only, by design: a child
// cannot own another child, so there is no chain to walk or unwind.
export async function getSwitchRoot(userDoc) {
  if (!userDoc?.id) return null;
  const prisma = getPrisma();
  if (!prisma) return null;
  try {
    // Read ownerId from the row rather than the mapped doc: mapUserRow does not
    // carry it, and a missing field must never turn a child into its own root.
    const row = await prisma.user.findUnique({
      where: { id: userDoc.id },
      select: { id: true, name: true, email: true, role: true, ownerId: true, suspended: true },
    });
    if (!row || row.suspended) return null;
    if (!row.ownerId) return { rootId: row.id, rootDoc: row };
    const rootDoc = await prisma.user.findUnique({
      where: { id: row.ownerId },
      select: { id: true, name: true, email: true, role: true, ownerId: true, suspended: true },
    });
    if (!rootDoc || rootDoc.suspended) return null;
    return { rootId: rootDoc.id, rootDoc };
  } catch (err) {
    logError("account_switch.root_read_failed", { error: err.message });
    return null;
  }
}

export function canUseSwitcher(rootDoc) {
  const email = String(rootDoc?.email || "").trim().toLowerCase();
  return Boolean(email) && switchOwnerEmails().includes(email);
}

// Who may drive the switcher from this request:
//   - the allowlisted root account itself, or
//   - a saved session that was deliberately filed under this root (i.e. the
//     owner switched to a child or pre-provisioned one on this device).
// A child's ordinary login session is untagged, so a member who signs in with
// their own password can never escalate into the owner's group.
export async function canUseSwitcherSession({ sid, rootId, realUid }) {
  if (!rootId || !realUid) return false;
  if (realUid === rootId) return true;
  if (!sid) return false;
  const prisma = getPrisma();
  if (!prisma) return false;
  try {
    const row = await prisma.session.findUnique({
      where: { id: sid },
      select: {
        userId: true,
        switchOwnerId: true,
        revokedAt: true,
        user: { select: { ownerId: true } },
      },
    });
    return (
      row?.userId === realUid &&
      row.switchOwnerId === rootId &&
      !row.revokedAt &&
      (row.userId === rootId || row.user?.ownerId === rootId)
    );
  } catch (err) {
    logError("account_switch.session_access_failed", { error: err.message });
    return false;
  }
}

// Attach an existing session to the switch group. Safe to call repeatedly.
export async function tagSessionForSwitch(sid, rootId) {
  if (!sid || !rootId) return;
  const prisma = getPrisma();
  if (!prisma) return;
  try {
    await prisma.session.updateMany({
      where: { id: sid, switchOwnerId: null },
      data: { switchOwnerId: rootId },
    });
  } catch (err) {
    logError("account_switch.tag_failed", { error: err.message });
  }
}

// The saved accounts this root may switch to: one row per member, newest
// session wins. Dead and suspended accounts are dropped from the list.
export async function listSwitchableAccounts({ rootId, currentUid, currentSid }) {
  const prisma = getPrisma();
  if (!prisma) return [];
  await tagSessionForSwitch(currentSid, rootId);

  let rows;
  try {
    rows = await prisma.session.findMany({
      where: {
        switchOwnerId: rootId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        // Defence in depth: a stray tag must not expose an account that is not
        // actually in this root's group.
        OR: [{ userId: rootId }, { user: { ownerId: rootId } }],
      },
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        userId: true,
        user: {
          select: { id: true, name: true, email: true, photoURL: true, role: true, suspended: true },
        },
      },
    });
  } catch (err) {
    logError("account_switch.list_failed", { error: err.message });
    return [];
  }

  const seen = new Set();
  const accounts = [];
  for (const row of rows) {
    if (!row.user || row.user.suspended || seen.has(row.user.id)) continue;
    seen.add(row.user.id);
    accounts.push({
      id: row.user.id,
      name: row.user.name || "",
      email: row.user.email || "",
      photoURL: row.user.photoURL || "",
      role: row.user.role || "member",
      current: row.user.id === currentUid,
    });
  }
  return accounts;
}

export async function findSwitchSession(rootId, targetUid) {
  const prisma = getPrisma();
  if (!prisma) return null;
  try {
    return await prisma.session.findFirst({
      where: {
        switchOwnerId: rootId,
        userId: targetUid,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true, userId: true },
    });
  } catch (err) {
    logError("account_switch.find_session_failed", { error: err.message });
    return null;
  }
}

// An account added by password may be unowned (created before this feature).
// Claim it for the root that proved access. Accounts owned by somebody else —
// and other owner accounts — stay off-limits.
export async function claimAccountForRoot(targetDoc, rootId) {
  if (!targetDoc?.id) return { ok: false, error: "Member not found." };
  if (targetDoc.id === rootId) return { ok: true };
  if (targetDoc.ownerId && targetDoc.ownerId !== rootId) {
    return { ok: false, error: "This account belongs to another owner." };
  }
  if (targetDoc.ownerId === rootId) return { ok: true };
  if (String(targetDoc.role || "").toLowerCase() === "owner") {
    return { ok: false, error: "Owner accounts cannot be added as a switched account." };
  }

  const prisma = getPrisma();
  if (!prisma) return { ok: false, error: "Database unavailable." };
  try {
    await prisma.user.update({
      where: { id: targetDoc.id },
      data: { ownerId: rootId },
    });
    return { ok: true };
  } catch (err) {
    logError("account_switch.claim_failed", { error: err.message });
    return { ok: false, error: "Could not link that account." };
  }
}

export async function deleteSwitchGroupSessions(rootId) {
  const prisma = getPrisma();
  if (!prisma || !rootId) return 0;
  try {
    const { count } = await prisma.session.deleteMany({
      where: { switchOwnerId: rootId },
    });
    return count;
  } catch (err) {
    logError("account_switch.delete_group_failed", { error: err.message });
    return 0;
  }
}
