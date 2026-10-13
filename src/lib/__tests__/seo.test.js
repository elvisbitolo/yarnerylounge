import test from "node:test";
import assert from "node:assert/strict";
import {
  SITE_URL,
  SITE_NAME,
  OG_IMAGE,
  PUBLIC_ROUTES,
  absoluteUrl,
  publicMetadata,
  organizationJsonLd,
  websiteJsonLd,
  breadcrumbJsonLd,
  eventJsonLd,
  courseJsonLd,
  faqJsonLd,
} from "../seo.js";

test("absoluteUrl joins relative paths onto the site origin", () => {
  assert.equal(absoluteUrl("/about"), `${SITE_URL}/about`);
  assert.equal(absoluteUrl("explore"), `${SITE_URL}/explore`);
  assert.equal(absoluteUrl("/"), SITE_URL);
  assert.equal(absoluteUrl("https://example.com/x"), "https://example.com/x");
});

test("PUBLIC_ROUTES never lists a login-walled route", () => {
  const gated = ["/rooms", "/events", "/courses", "/spaces", "/articles", "/members", "/dashboard"];
  for (const route of PUBLIC_ROUTES) {
    assert.equal(gated.includes(route.path), false, `${route.path} must not be public`);
  }
});

test("organizationJsonLd describes the org with its logo", () => {
  const ld = organizationJsonLd();
  assert.equal(ld["@type"], "Organization");
  assert.equal(ld.name, SITE_NAME);
  assert.equal(ld.url, SITE_URL);
  assert.ok(ld.logo.endsWith("/icon-512.png"));
});

test("websiteJsonLd names the site and points at the origin", () => {
  const ld = websiteJsonLd();
  assert.equal(ld["@type"], "WebSite");
  assert.equal(ld.name, SITE_NAME);
  assert.equal(ld.url, SITE_URL);
});

test("breadcrumbJsonLd numbers items in order and absolutizes paths", () => {
  const ld = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Explore", path: "/explore" },
  ]);
  assert.equal(ld["@type"], "BreadcrumbList");
  assert.equal(ld.itemListElement.length, 2);
  assert.deepEqual(
    ld.itemListElement.map((i) => i.position),
    [1, 2]
  );
  assert.equal(ld.itemListElement[1].item, `${SITE_URL}/explore`);
});

test("eventJsonLd marks it online, scheduled and dated", () => {
  const ld = eventJsonLd({ title: "Stitch Night", description: "x", startTime: Date.UTC(2026, 0, 1) });
  assert.equal(ld["@type"], "Event");
  assert.equal(ld.eventAttendanceMode, "https://schema.org/OnlineEventAttendanceMode");
  assert.equal(ld.eventStatus, "https://schema.org/EventScheduled");
  assert.equal(ld.startDate, new Date(Date.UTC(2026, 0, 1)).toISOString());
  assert.equal(ld.location["@type"], "VirtualLocation");
});

test("courseJsonLd adds an Offer only for paid courses", () => {
  const paid = courseJsonLd({ title: "Amigurumi 101", purchasePriceCents: 795 });
  assert.equal(paid.offers.price, "7.95");
  assert.equal(paid.offers.priceCurrency, "USD");

  const free = courseJsonLd({ title: "Free Intro", purchasePriceCents: 0 });
  assert.equal(free.offers, undefined);
});

test("faqJsonLd wraps each Q/A as a Question", () => {
  const ld = faqJsonLd([{ question: "Why pay?", answer: "To keep it ad-free." }]);
  assert.equal(ld["@type"], "FAQPage");
  assert.equal(ld.mainEntity[0]["@type"], "Question");
  assert.equal(ld.mainEntity[0].acceptedAnswer.text, "To keep it ad-free.");
});

test("publicMetadata sets a self-canonical and OG image", () => {
  const meta = publicMetadata({ title: "Explore", description: "d", path: "/explore" });
  assert.equal(meta.alternates.canonical, `${SITE_URL}/explore`);
  assert.equal(meta.openGraph.url, `${SITE_URL}/explore`);
  assert.equal(meta.openGraph.images[0].url, OG_IMAGE);
  assert.equal(meta.twitter.card, "summary_large_image");
});

test("publicMetadata falls back to the site description", () => {
  const meta = publicMetadata({ title: "About", path: "/about" });
  assert.ok(meta.description.length > 0);
});
