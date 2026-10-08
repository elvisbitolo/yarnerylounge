import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";
import { getCollectionsWithSpaces } from "@/lib/server/collections";
import { cardThemeVars } from "@/lib/card-themes";
import styles from "./collections.module.css";

const COLLECTION_THEMES = ["violet", "teal", "indigo", "rose", "amber", "emerald", "sky"];

export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const collections = await getCollectionsWithSpaces();

  return (
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "48px 24px" }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: "#17171c", margin: "0 0 8px" }}>
          Collections
        </h1>
        <p style={{ fontSize: 16, color: "#6b6b7b", margin: "0 0 32px" }}>
          Browse curated groups of spaces
        </p>

        {collections.length === 0 ? (
          <div style={{
            padding: 48,
            textAlign: "center",
            background: "#ffffff",
            border: "1px dashed #d8d8e3",
            borderRadius: 14,
            color: "#9b9bab",
            fontSize: 15,
          }}>
            No collections yet.
          </div>
        ) : (
          <div className={styles.grid}>
            {collections.map((col, i) => (
              <Link
                key={col.id}
                href={`/collections/${col.id}`}
                className={styles.card}
                style={cardThemeVars(COLLECTION_THEMES[i % COLLECTION_THEMES.length], { light: true })}
              >
                <h2 className={styles.cardName}>{col.name}</h2>
                {col.description && <p className={styles.cardDesc}>{col.description}</p>}
                <p className={styles.cardMeta}>
                  {(col.spaces || []).length} {(col.spaces || []).length === 1 ? "space" : "spaces"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
  );
}
