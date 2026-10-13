import { getExploreData } from "@/lib/server/explore";
import { SITE_NAME, SITE_DESCRIPTION, SITE_URL, absoluteUrl } from "@/lib/seo";

// Public "what's happening" feed for Google/readers. Deliberately built from the
// same publicPreview content as /explore — it never exposes members-only data.
export const revalidate = 3600;

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function item({ title, description, link, guid, date }) {
  const pubDate = date ? new Date(date) : new Date();
  return `
    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">${escapeXml(guid)}</guid>
      <pubDate>${pubDate.toUTCString()}</pubDate>
      <description>${escapeXml(description)}</description>
    </item>`;
}

export async function GET() {
  const data = await getExploreData(20);
  const exploreUrl = absoluteUrl("/explore");

  const items = [
    ...data.events.map((event) =>
      item({
        title: `Event: ${event.title}`,
        description: event.description,
        link: exploreUrl,
        guid: `event:${event.id}`,
        date: event.startTime,
      })
    ),
    ...data.courses.map((course) =>
      item({
        title: `Course: ${course.title}`,
        description: course.description,
        link: exploreUrl,
        guid: `course:${course.id}`,
      })
    ),
    ...data.rooms.map((room) =>
      item({
        title: `Lounge: ${room.name}`,
        description: room.description,
        link: exploreUrl,
        guid: `room:${room.id}`,
      })
    ),
  ].join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_NAME)}</title>
    <link>${SITE_URL}</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${absoluteUrl("/feed.xml")}" rel="self" type="application/rss+xml" />
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
