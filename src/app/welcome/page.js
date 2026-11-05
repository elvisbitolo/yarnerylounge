import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import WelcomeJourney from "./WelcomeJourney";
import styles from "./welcome.module.css";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const member = await getUserDoc(user.uid);
  if (member?.extra?.welcomeJourneyPending !== true) redirect("/dashboard");

  return (
    <main className={styles.page}>
      <WelcomeJourney initial={{
        name: member?.name || user.name || "",
        username: member?.username || "",
        photoURL: member?.photoURL || user.photoURL || "",
        headline: member?.headline || "",
        location: member?.location || "",
        bio: member?.bio || "",
      }} />
    </main>
  );
}
