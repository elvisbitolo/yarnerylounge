import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import AdminRail from "@/components/AdminRail";
import styles from "@/lib/admin/admin.module.css";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);
  const role = userDoc?.role;
  if (role !== "owner" && role !== "moderator") {
    redirect("/dashboard");
  }

  return (
    <div className={styles.shell}>
      <AdminRail role={role} name={userDoc?.name} email={user.email} />
      <div className={styles.body}>{children}</div>
    </div>
  );
}
