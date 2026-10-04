import { authorize } from "@/lib/server/authorize";
import styles from "./RequireOwner.module.css";

export default async function RequireOwner({ children, what = "this area" }) {
  const auth = await authorize({ owner: true, active: false });

  if (!auth.ok) {
    if (auth.status === 401) {
      return (
        <div className={styles.page}>
          <div className={styles.card}>
            <h1 className={styles.title}>Sign in required</h1>
            <p className={styles.body}>You need to be signed in to view {what}.</p>
          </div>
        </div>
      );
    }
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>Owner access only</h1>
          <p className={styles.body}>
            {what} is restricted to owners because it exposes data moderators are not cleared for.
          </p>
        </div>
      </div>
    );
  }

  return children;
}