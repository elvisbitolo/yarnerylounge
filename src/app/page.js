import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Home() {
  // A returning member with a live cookie is silently routed to /dashboard by
  // the reentry route (refresh-on-expiry included); signed-out visitors land on
  // the signup wall.
  redirect("/api/auth/reentry");
}