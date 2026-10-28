import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";
import WhatsAppLink from "./WhatsAppLink";

export const dynamic = "force-dynamic";

export default async function SocialSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 20px 64px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Linked accounts</h1>
      <p style={{ opacity: 0.7, marginBottom: 24 }}>Connect accounts to receive DMs for mentions and messages. This is additive and never replaces in-app or push notifications.</p>
      <WhatsAppLink />
    </div>
  );
}
