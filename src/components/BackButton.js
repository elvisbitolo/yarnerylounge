"use client";

import { useRouter } from "next/navigation";
import { useNavigationSlide } from "@/lib/navigation-slide";
import styles from "./BackButton.module.css";

export default function BackButton({ fallback = "/", label = "Back" }) {
  const router = useRouter();
  const slide = useNavigationSlide();

  return (
    <button
      type="button"
      className={styles.back}
      onClick={() => {
        if (slide?.slideBack) {
          slide.slideBack();
          return;
        }
        if (window.history.length > 1) {
          router.back();
        } else {
          router.replace(fallback);
        }
      }}
    >
      <span className={styles.arrow}>←</span>
      {label}
    </button>
  );
}