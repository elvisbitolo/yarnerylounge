import Link from "next/link";
import Nav from "@/components/Nav";
import BackButton from "@/components/BackButton";
import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { getSpace } from "@/lib/server/spaces";
import { cardThemeVars } from "@/lib/card-themes";
import styles from "../collections.module.css";

const SPACE_THEMES = ["indigo", "teal", "violet", "amber", "emerald", "sky", "rose"];

export const dynamic = "force-dynamic";

export default async function CollectionDetailPage({ params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const userDoc = user ? await getUserDoc(user.uid) : null;

  const prisma = getPrisma();
  const colRow = prisma
    ? await prisma.spaceCollection.findUnique({ where: { id } })
    : null;
  if (!colRow) {
    return (
      <Nav role={userDoc?.role}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "48px 24px" }}>
          <BackButton fallback="/collections" label="All collections" />
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#17171c" }}>Collection not found</h1>
        </div>
      </Nav>
    );
  }

  const collection = {
    id: colRow.id,
    name: colRow.name || "",
    description: colRow.description || "",
    spaceIds: Array.isArray(colRow.spaceIds) ? colRow.spaceIds : [],
  };
  const spaces = [];
  for (const spaceId of collection.spaceIds || []) {
    const space = await getSpace(spaceId);
    if (space && space.status !== "deleted") {
      const memberCount = prisma
        ? await prisma.spaceMember.count({ where: { spaceId } })
        : 0;
      spaces.push({
        id: space.id,
        name: space.name,
        description: space.description || "",
        features: space.features || {},
        memberCount,
      });
    }
  }

  return (
    <Nav role={userDoc?.role}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "48px 24px" }}>
        <BackButton fallback="/collections" label="All collections" />
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#17171c", margin: "16px 0 8px" }}>
          {collection.name}
        </h1>
        {collection.description && (
          <p style={{ fontSize: 16, color: "#6b6b7b", margin: "0 0 32px" }}>
            {collection.description}
          </p>
        )}

        {spaces.length === 0 ? (
          <div style={{
            padding: 48,
            textAlign: "center",
            background: "#ffffff",
            border: "1px dashed #d8d8e3",
            borderRadius: 14,
            color: "#9b9bab",
            fontSize: 15,
          }}>
            No spaces in this collection yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {spaces.map((space, i) => (
              <Link
                key={space.id}
                href={`/spaces/${space.slug || space.id}`}
                className={styles.spaceCard}
                style={cardThemeVars(SPACE_THEMES[i % SPACE_THEMES.length], { light: true })}
              >
                <h3 className={styles.spaceName}>{space.name}</h3>
                {space.description && <p className={styles.spaceDesc}>{space.description}</p>}
                <div className={styles.badgeRow}>
                  <span className={styles.badge}>{space.memberCount} members</span>
                  {Object.entries(space.features)
                    .filter(([, v]) => v)
                    .map(([key]) => (
                      <span key={key} className={styles.badge}>{key}</span>
                    ))}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Nav>
  );
}
