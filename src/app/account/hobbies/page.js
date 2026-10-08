import { redirect } from "next/navigation";
import AccountTabs from "../AccountTabs";
import HobbiesForm from "../HobbiesForm";
import styles from "../account.module.css";
import { loadAccount } from "../account-data";

export const dynamic = "force-dynamic";

export default async function AccountHobbiesPage() {
  const data = await loadAccount();
  if (!data) redirect("/login");
  const { userDoc } = data;

  const initialHobbies = Array.isArray(userDoc?.hobbies)
    ? userDoc.hobbies.map((h) => String(h || "").trim().toLowerCase()).filter(Boolean)
    : [];

  return (
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Hobbies</h1>
        </header>
        <AccountTabs />
        <HobbiesForm initial={initialHobbies} username={userDoc?.username} />
      </div>
  );
}
