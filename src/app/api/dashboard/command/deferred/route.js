import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getDashboardCommandDeferredData } from "@/lib/server/dashboard-command";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const userDoc = await getUserDoc(user.uid);
    const data = await getDashboardCommandDeferredData(user.uid, userDoc || {});
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to load dashboard details" },
      { status: 500 }
    );
  }
}
