import { redirect } from "next/navigation";
import { getCurrentUserStatus } from "@/lib/server/auth";
import {
  SESSION_OK,
  SESSION_NEEDS_CONSENT,
  SESSION_UNAVAILABLE,
} from "@/lib/server/session-store";
import ConsentForm from "./ConsentForm";
import styles from "../auth.module.css";

// Terms of Service consent screen. Reached only from an authenticated session
// that has never accepted the ToS — every other verdict has a better home:
//
//   SESSION_OK            already accepted (or grandfathered) -> the app
//   gone / no cookie      there is nothing to consent with    -> /login
//   SESSION_UNAVAILABLE   unknown right now                   -> retry here
//
// Rendering this rather than redirecting keeps the cookie untouched: a consent
// screen that bounced to /login would put a member with a perfectly healthy
// session in front of a sign-in form, which is exactly the loop this exists to
// avoid.
export default async function ConsentPage() {
  const current = await getCurrentUserStatus();

  if (current.status === SESSION_OK) redirect("/dashboard");
  if (current.status === SESSION_UNAVAILABLE) return <Unavailable />;
  if (current.status !== SESSION_NEEDS_CONSENT) redirect("/login");

  return <ConsentForm />;
}

// The store could not be reached. Deliberately not a redirect: /login would
// run its auth wall against the same unreachable store, conclude "signed out",
// and put the member in front of a form that cannot help them either.
function Unavailable() {
  return (
    <main className={styles.signingInScreen}>
      <p className={styles.brand}>
        <span className={styles.brandWord}>Secret Yarnery</span>
      </p>
      <div className={styles.signingIn} role="status" aria-live="polite">
        <p className={styles.loadText}>We couldn&apos;t check your session just now.</p>
        <a className={styles.linkBtn} href="/consent">
          Try again
        </a>
      </div>
    </main>
  );
}
