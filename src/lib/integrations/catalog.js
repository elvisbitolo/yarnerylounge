export const INTEGRATION_CATALOG = [
  {
    id: "ravelry",
    name: "Ravelry",
    category: "Patterns & projects",
    description: "Keep your pattern library, project notes and yarn-stash profile close to your Speakeasy community.",
    memberBenefit: "Share your Ravelry profile so members can discover the patterns and projects you love.",
    url: "https://www.ravelry.com",
    profilePrefix: "https://www.ravelry.com/people/",
    domains: ["ravelry.com", "www.ravelry.com"],
    icon: "yarn",
    availability: "profile-link",
    featured: true,
  },
  {
    id: "pinterest",
    name: "Pinterest",
    category: "Inspiration",
    description: "Bring your crochet mood boards, colour palettes and saved project ideas into your member profile.",
    memberBenefit: "Let your community browse the ideas inspiring your next make.",
    url: "https://www.pinterest.com",
    profilePrefix: "https://www.pinterest.com/",
    domains: ["pinterest.com", "www.pinterest.com"],
    icon: "pin",
    availability: "profile-link",
    featured: true,
  },
  {
    id: "instagram",
    name: "Instagram",
    category: "Share your makes",
    description: "Showcase finished pieces, works in progress, reels and behind-the-scenes moments.",
    memberBenefit: "Give other crocheters a direct path to your creative work.",
    url: "https://www.instagram.com",
    profilePrefix: "https://www.instagram.com/",
    domains: ["instagram.com", "www.instagram.com"],
    icon: "camera",
    availability: "profile-link",
    featured: true,
  },
  {
    id: "youtube",
    name: "YouTube",
    category: "Learning",
    description: "Share your crochet channel, stitch demonstrations and favourite tutorial playlists.",
    memberBenefit: "Help members find the tutorials and techniques you recommend.",
    url: "https://www.youtube.com",
    profilePrefix: "https://youtube.com/@",
    domains: ["youtube.com", "www.youtube.com", "youtu.be"],
    icon: "play",
    availability: "profile-link",
    featured: true,
  },
  {
    id: "etsy",
    name: "Etsy",
    category: "Handmade & patterns",
    description: "Show members your Etsy shop or the independent pattern makers you support.",
    memberBenefit: "Make it easier to discover handmade pieces and independent crochet designers.",
    url: "https://www.etsy.com",
    profilePrefix: "https://www.etsy.com/shop/",
    domains: ["etsy.com", "www.etsy.com"],
    icon: "store",
    availability: "profile-link",
    featured: false,
  },
  {
    id: "tiktok",
    name: "TikTok",
    category: "Share your makes",
    description: "Link short-form crochet tutorials, project reveals and creative process videos.",
    memberBenefit: "Share quick inspiration and bite-sized crochet knowledge.",
    url: "https://www.tiktok.com",
    profilePrefix: "https://www.tiktok.com/@",
    domains: ["tiktok.com", "www.tiktok.com"],
    icon: "video",
    availability: "profile-link",
    featured: false,
  },
];

export const INTEGRATION_BY_ID = Object.fromEntries(
  INTEGRATION_CATALOG.map((integration) => [integration.id, integration])
);

export function buildIntegrationProfileUrl(provider, value) {
  const integration = INTEGRATION_BY_ID[provider];
  if (!integration || typeof value !== "string") return null;
  const username = value.trim().replace(/^@/, "");
  if (!username || username.length > 100 || !/^[A-Za-z0-9._-]+$/.test(username)) return null;
  return integration.profilePrefix + encodeURIComponent(username);
}

export function isAllowedIntegrationUrl(provider, value) {
  const integration = INTEGRATION_BY_ID[provider];
  if (!integration || typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      integration.domains.includes(url.hostname.toLowerCase()) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function defaultCommunityIntegrations() {
  return INTEGRATION_CATALOG.map(({ id, featured }) => ({
    id,
    enabled: true,
    featured,
    communityUrl: "",
  }));
}
