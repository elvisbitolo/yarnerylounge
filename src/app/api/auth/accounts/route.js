import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE, getCurrentUserStatus, getUserDoc } from "@/lib/server/auth";
import { parseSessionCookie } from "@/lib/server/auth-core";
import { SESSION_OK } from "@/lib/server/session-store";
import {
  canUseSwitcher,
  canUseSwitcherSession,
  getSwitchRoot,
  listSwitchableAccounts,
} from "@/lib/server/account-switch";

// Safe labels for the saved accounts this member may switch to. Tokens never
// leave the server; the client only gets name/email/avatar and the current flag.
export async function GET() {
  const current = await getCurrentUserStatus();
  if (current.status !== SESSION_OK) {
    return NextResponse.json({ accounts: [], eligible: false }, { status: 200 });
  }

  const realUid = current.identity.actorUid || current.identity.uid;
  const userDoc = await getUserDoc(realUid);
  const root = await getSwitchRoot(userDoc);
  const sid = parseSessionCookie((await cookies()).get(AUTH_COOKIE)?.value)?.sid;
  // The allowlisted root and saved switch sessions may drive the switcher. A
  // child's ordinary login session is untagged and cannot escalate.
  if (
    !root ||
    !canUseSwitcher(root.rootDoc) ||
    !(await canUseSwitcherSession({ sid, rootId: root.rootId, realUid }))
  ) {
    return NextResponse.json({ accounts: [], eligible: false }, { status: 200 });
  }

  const accounts = await listSwitchableAccounts({
    rootId: root.rootId,
    currentUid: realUid,
    currentSid: sid,
  });

  return NextResponse.json({ eligible: true, accounts });
}
