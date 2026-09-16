export const SOCIAL_PLATFORMS = [
  {
    value: "instagram",
    label: "Instagram",
    placeholder: "@yourusername",
    hint: "Just your username",
    buildUrl: (handle) => `https://instagram.com/${handle}`,
  },
  {
    value: "tiktok",
    label: "TikTok",
    placeholder: "@yourusername",
    hint: "Just your username",
    buildUrl: (handle) => `https://www.tiktok.com/@${handle}`,
  },
  {
    value: "youtube",
    label: "YouTube",
    placeholder: "@yourhandle or channel name",
    hint: "Channel handle or name",
    buildUrl: (handle) => `https://youtube.com/@${handle}`,
  },
  {
    value: "facebook",
    label: "Facebook",
    placeholder: "username or page name",
    hint: "Username, not the full link",
    buildUrl: (handle) => `https://facebook.com/${handle}`,
  },
  {
    value: "twitter",
    label: "X / Twitter",
    placeholder: "@yourusername",
    hint: "Just your username",
    buildUrl: (handle) => `https://x.com/${handle}`,
  },
  {
    value: "etsy",
    label: "Etsy",
    placeholder: "shopname",
    hint: "Your shop name",
    buildUrl: (handle) => `https://www.etsy.com/shop/${handle}`,
  },
  {
    value: "pinterest",
    label: "Pinterest",
    placeholder: "@yourusername",
    hint: "Just your username",
    buildUrl: (handle) => `https://pinterest.com/${handle}`,
  },
  {
    value: "ravelry",
    label: "Ravelry",
    placeholder: "yourusername",
    hint: "Your Ravelry name",
    buildUrl: (handle) => `https://ravelry.com/people/${handle}`,
  },
  {
    value: "website",
    label: "Website",
    placeholder: "yourdomain.com",
    hint: "Domain or full link — no ‘https://’ needed",
    buildUrl: (handle) => {
      const value = String(handle || "").trim();
      if (!value) return "";
      if (/^https?:\/\//i.test(value)) return value;
      return `https://${value.replace(/^\/+/, "")}`;
    },
  },
  {
    value: "other",
    label: "Other",
    placeholder: "yourhandle or url",
    hint: "Username or link — protocol optional",
    buildUrl: (handle) => {
      const value = String(handle || "").trim();
      if (!value) return "";
      return /^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/+/, "")}`;
    },
  },
];

export function platformInfo(value) {
  return SOCIAL_PLATFORMS.find((p) => p.value === value) || SOCIAL_PLATFORMS[SOCIAL_PLATFORMS.length - 1];
}

export function buildSocialUrl(platform, handle) {
  return platformInfo(platform).buildUrl(handle || "");
}

export function extractHandle(platform, url) {
  if (!url) return "";
  const cleaned = String(url).replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  if (platform === "website" || platform === "other") return cleaned;
  const parts = cleaned.split("/").filter(Boolean);
  return parts[parts.length - 1] || cleaned;
}