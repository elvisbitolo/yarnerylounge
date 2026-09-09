import Image from "next/image";
import styles from "../app/auth.module.css";

// Full-bleed backdrop for the auth pages: the image occupies the entire
// aside column on desktop and collapses to a hero banner above the form
// on small screens (see the media queries in auth.module.css).
export default function AuthAside() {
  return (
    <aside className={styles.aside}>
      <Image
        src="/images/alongauthentication.jpeg"
        alt="Christa's Secret Swipe Speakeasy — stitch together in the 24/7 video lounge"
        fill
        priority
        sizes="(max-width: 768px) 92vw, 460px"
        className={styles.asideImage}
      />
    </aside>
  );
}