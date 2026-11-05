import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { listHostAssignments } from "@/lib/server/hosts";
import { getCapabilities, canHost } from "@/lib/server/capabilities";

export const dynamic = "force-dynamic";

export default async function HostLayout({ children }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);
  const role = userDoc?.role;
  if (role === "owner" || role === "moderator") return children;

  // Moving In includes host privileges even when the member has not been
  // separately assigned to a host scope. Keep the layout aligned with the
  // same capability check used by the lounge creation API.
  const capabilities = await getCapabilities(user.uid);
  if (canHost(capabilities)) return children;

  const assignments = await listHostAssignments({ userId: user.uid });
  if (assignments.length === 0) redirect("/dashboard");

  return children;
}
