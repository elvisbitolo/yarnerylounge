import PageBlocksEditor from "@/components/admin/PageBlocksEditor";
import { PAGE_SLUGS } from "@/lib/page-blocks";

export const dynamic = "force-dynamic";

export default function AdminPublicPagesPage() {
  const pages = Object.entries(PAGE_SLUGS).map(([slug, spec]) => ({
    slug,
    label: spec.label,
    path: spec.path,
  }));
  return <PageBlocksEditor pages={pages} />;
}
