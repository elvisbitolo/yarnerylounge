import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import Nav from "@/components/Nav";
import InviteManager from "./InviteManager";

export const dynamic = "force-dynamic";

export default async function InvitePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  return (
    <Nav role={userDoc?.role}>
      <InviteManager />
    </Nav>
  );
}