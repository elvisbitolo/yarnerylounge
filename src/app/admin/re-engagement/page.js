import styles from "./page.module.css";
import ClientPage from "./ClientPage";

export const dynamic = "force-dynamic";

export default function Page() {
  return <main className={styles.page}><ClientPage /></main>;
}
