import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc, canModerate } from "@/lib/server/auth";
import WhatsAppInbox from "@/components/WhatsAppInbox";

export const dynamic = "force-dynamic";

export default async function WhatsAppInboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const userDoc = await getUserDoc(user.uid);
  if (!canModerate(userDoc)) redirect("/dashboard");
  return <WhatsAppInbox />;
}
