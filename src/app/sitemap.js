import { PUBLIC_ROUTES, absoluteUrl } from "@/lib/seo";

// Only genuinely public, indexable pages belong here. Login-walled content
// (rooms, events, courses, articles, members …) returns a redirect to /login
// for crawlers, so advertising it in the sitemap would just burn crawl budget.
export const dynamic = "force-static";

export default function sitemap() {
  const lastModified = new Date();
  return PUBLIC_ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: absoluteUrl(path),
    lastModified,
    changeFrequency,
    priority,
  }));
}
