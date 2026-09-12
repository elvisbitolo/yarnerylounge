import { getExploreData } from "@/lib/server/explore";
import { CANONICAL_ORIGIN } from "@/lib/server/origin";

export const dynamic = "force-dynamic";

export default async function sitemap() {
  const base = CANONICAL_ORIGIN;

  const staticRoutes = ["/signup", "/login", "/about", "/guidelines", "/terms"].map(
    (path) => ({
      url: `${base}${path}`,
      lastModified: new Date(),
      changeFrequency: path === "/signup" ? "weekly" : "monthly",
      priority: path === "/signup" ? 1 : 0.7,
    })
  );

  const data = await getExploreData(50);

  const routes = [
    ...data.rooms.map((room) => ({
      url: `${base}/rooms/${room.slug}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.6,
    })),
    ...data.spaces.map((space) => ({
      url: `${base}/spaces/${space.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    })),
  ];

  return [...staticRoutes, ...routes];
}
