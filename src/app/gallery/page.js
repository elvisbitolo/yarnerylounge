import { redirect } from "next/navigation";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import Nav from "@/components/Nav";
import GalleryGrid from "./GalleryGrid";

export const dynamic = "force-dynamic";

const CROCHET_IMAGES = [
  { src: "/images/crochet/model_portrait_studio_01.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_portrait_studio_02.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_in_shop_01.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_in_shop_02.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_in_shop_03.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_in_shop_04.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_in_shop_05.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_in_shop_06.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_in_shop_07.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_in_shop_08.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_in_shop_09.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_in_shop_10.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_in_shop_11.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_garden_yarn_01.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_garden_yarn_02.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_pink_dress_garden_01.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_pink_dress_garden_02.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_pink_dress_garden_03.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_pink_dress_garden_04.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_pink_dress_garden_05.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_pink_dress_garden_06.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_pink_dress_garden_07.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_pink_dress_garden_08.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_pink_dress_garden_09.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_wearing_crochet_garden_01.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_wearing_crochet_garden_02.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/model_wearing_crochet_garden_03.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/shop_interior_01.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/shop_interior_02.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/shop_interior_03.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/shop_interior_04.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/product_closeup_01.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/product_closeup_02.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/product_closeup_03.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/product_closeup_04.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/product_closeup_05.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/product_closeup_06.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/product_closeup_07.jpeg", alt: "Crochet work" },
  { src: "/images/crochet/product_closeup_08.jpeg", alt: "Crochet work" },
];

export default async function GalleryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const userDoc = await getUserDoc(user.uid);

  const prisma = getPrisma();
  const postRows = prisma
    ? await prisma.post.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
      })
    : [];

  const photos = postRows
    .map((d) => {
      if (!d.imageUrl) return null;
      return {
        id: d.id,
        imageUrl: d.imageUrl,
        text: d.text || "",
        authorId: d.authorId || "",
        authorName: d.authorName || "Member",
        createdAt: d.createdAt ? d.createdAt.getTime() : 0,
      };
    })
    .filter(Boolean)
    .slice(0, 80);

  const allPhotos = [
    ...CROCHET_IMAGES.map((img, i) => ({
      id: `crochet-${i}`,
      imageUrl: img.src,
      text: img.alt,
      authorId: "",
      authorName: "Mamameer",
      createdAt: 0,
    })),
    ...photos,
  ];

  return (
    <Nav role={userDoc?.role}>
      <div className="gallery-page" style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 20px 64px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#f5f5f5", margin: "0 0 6px" }}>
          Gallery
        </h1>
        <p style={{ fontSize: 14, color: "#9b9bab", margin: "0 0 28px" }}>
          Click any photo to see the project and its maker.
        </p>
        <GalleryGrid photos={allPhotos} />
      </div>
    </Nav>
  );
}
