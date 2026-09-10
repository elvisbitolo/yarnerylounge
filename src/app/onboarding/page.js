import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import Nav from "@/components/Nav";
import OnboardingForm from "./OnboardingForm";
import styles from "./onboarding.module.css";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const userDoc = await getUserDoc(user.uid);

  return (
    <Nav role={userDoc?.role}>
      <main className={styles.page}>
        <div className={styles.card}>
          <p className={styles.eyebrow}>Welcome to Yarnery Lounge</p>
          <h1 className={styles.title}>Tell us how you craft</h1>
          <p className={styles.intro}>
            We use these answers to surface better rooms, courses, and member matches. You can update them from your profile later.
          </p>
          <OnboardingForm initial={userDoc || {}} />
        </div>
      </main>
    </Nav>
  );
}
