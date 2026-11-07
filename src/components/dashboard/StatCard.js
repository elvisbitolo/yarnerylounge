"use client";

import { cardThemeVars } from "@/lib/card-themes";
import { ArrowDown, ArrowUp } from "lucide-react";
import styles from "./dashboard.module.css";

export default function StatCard({ label, value, delta, deltaLabel, theme = "indigo" }) {
  const deltaClass = !delta
    ? styles.kpiDelta
    : delta > 0
      ? `${styles.kpiDelta} ${styles.kpiDeltaUp}`
      : delta < 0
        ? `${styles.kpiDelta} ${styles.kpiDeltaDown}`
        : styles.kpiDelta;

  return (
    <div className={styles.kpi} style={cardThemeVars(theme, { light: true })}>
      <p className={styles.kpiLabel}>{label}</p>
      <p className={styles.kpiValue}>{value}</p>
      <p className={deltaClass}>
        {delta != null && delta !== 0 && (
          <span>{delta > 0 ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />} {Math.abs(delta)}% </span>
        )}
        {deltaLabel || ""}
      </p>
    </div>
  );
}
