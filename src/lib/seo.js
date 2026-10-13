import { CANONICAL_ORIGIN } from "./server/origin.js";

// Single source of truth for everything search engines read: site identity,
// the list of genuinely public (indexable) routes, and the JSON-LD builders.
// Kept free of React/fetch so the shapes can be unit tested.

export const SITE_URL = CANONICAL_ORIGIN.replace(/\/+$/, "");
export const SITE_NAME = "Secret Yarnery";
export const SITE_DESCRIPTION =
  "Secret Yarnery is a paid membership community with live video lounges, courses, events, groups and real conversations — connect, learn and grow together in one place.";
export const SITE_LOGO = `${SITE_URL}/icon-512.png`;
export const OG_IMAGE = `${SITE_URL}/og-image.png`;
export const OG_IMAGE_WIDTH = 1734;
export const OG_IMAGE_HEIGHT = 907;
export const SHOPIFY_URL =
  process.env.NEXT_PUBLIC_SHOPIFY_PRICING_URL || "https://secretyarnery.com/pages/speakeasy";

// Only these routes return 200 to a signed-out crawler. Everything else is
// behind the auth wall (see src/proxy.js AUTH_ROUTES) and must never appear in
// the sitemap or as a canonical target.
export const PUBLIC_ROUTES = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/explore", changeFrequency: "daily", priority: 0.9 },
  { path: "/about", changeFrequency: "monthly", priority: 0.7 },
  { path: "/guidelines", changeFrequency: "monthly", priority: 0.5 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/signup", changeFrequency: "weekly", priority: 0.8 },
  { path: "/login", changeFrequency: "monthly", priority: 0.4 },
];

export function absoluteUrl(path = "/") {
  if (!path || path === "/") return SITE_URL;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

// Canonical + Open Graph + Twitter metadata for a public page. `title` is fed
// through the root layout's "%s — Secret Yarnery" template, so pass a bare
// page name ("Explore") not a pre-suffixed one.
export function publicMetadata({
  title,
  description,
  path,
  image,
  type = "website",
  publishedTime,
  absolute = false,
} = {}) {
  const url = absoluteUrl(path);
  const desc = description || SITE_DESCRIPTION;
  return {
    title: absolute && title ? { absolute: title } : title,
    description: desc,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: desc,
      url,
      siteName: SITE_NAME,
      type,
      ...(publishedTime ? { publishedTime } : {}),
      images: [
        {
          url: image || OG_IMAGE,
          width: OG_IMAGE_WIDTH,
          height: OG_IMAGE_HEIGHT,
          alt: `${title || SITE_NAME} — ${SITE_NAME}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: [image || OG_IMAGE],
    },
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: SITE_LOGO,
    description: SITE_DESCRIPTION,
    sameAs: [SHOPIFY_URL],
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
  };
}

export function breadcrumbJsonLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: (items || []).map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function eventJsonLd(event) {
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.description || undefined,
    startDate: event.startTime ? new Date(event.startTime).toISOString() : undefined,
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: { "@type": "VirtualLocation", url: absoluteUrl("/explore") },
    organizer: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    image: OG_IMAGE,
  };
}

export function courseJsonLd(course) {
  const paid = Number(course.purchasePriceCents) > 0;
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    description: course.description || undefined,
    provider: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    ...(paid
      ? {
          offers: {
            "@type": "Offer",
            price: (Number(course.purchasePriceCents) / 100).toFixed(2),
            priceCurrency: "USD",
            category: "paid",
            url: absoluteUrl("/signup"),
          },
        }
      : {}),
  };
}

export function faqJsonLd(faqs) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: (faqs || []).map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}
