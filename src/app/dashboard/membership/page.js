import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import DashboardShell from "@/components/dashboard/DashboardShell";

export const dynamic = "force-dynamic";

export default async function DashboardMembershipPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");


  return (
      <DashboardShell view="membership" />
  );
}