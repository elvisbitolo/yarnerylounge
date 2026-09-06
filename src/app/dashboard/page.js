import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { recordDailyVisit } from "@/lib/server/gamification";
import { loungeGate } from "@/lib/server/lounge-gate";
import Nav from "@/components/Nav";
import DashboardShell from "@/components/dashboard/DashboardShell";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  const gate = await loungeGate(user.uid, userDoc);
  if (gate) redirect(gate);

  recordDailyVisit(user.uid, userDoc?.name || user.name || "Member").catch(() => {});

  return (
    <Nav role={userDoc?.role}>
      <DashboardShell />
    </Nav>
  );
}
