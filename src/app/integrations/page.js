import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";
import IntegrationsMarketplace from "./IntegrationsMarketplace";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <IntegrationsMarketplace />;
}
