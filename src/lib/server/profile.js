import { QUIZ_QUESTIONS } from "../profile/questions.js";
import { isValidCountry } from "../profile/countries.js";
import { buildSocialUrl } from "../profile/social.js";

function clean(value, max) {
  return (typeof value === "string" ? value : "").trim().slice(0, max);
}

export const CRAFT_OPTIONS = [
  "crochet",
  "knitting",
  "weaving",
  "spinning",
  "dyeing",
  "embroidery",
  "macrame",
];

export const HOBBIES = [
  "cooking",
  "baking",
  "gardening",
  "shopping",
  "thrifting",
  "decoupage",
  "yoga",
  "pottery",
  "painting",
  "card games",
  "photography",
  "board games",
  "antiquing",
  "reading",
  "scrapbooking",
  "upholstery",
  "woodworking",
  "sewing",
  "dyeing",
  "spinning",
  "knitting",
  "crochet",
];

export const CROCHET_TECHNIQUES = [
  "amigurumi",
  "blankets & afghans",
  "garments & sweaters",
  "shawls & wraps",
  "granny squares",
  "doilies & lace",
  "filet crochet",
  "Tunisian crochet",
  "waffle, puff & bobble stitches",
  "basket weave & braided cables",
  "chunky & oversized makes",
  "gradient & self-striping yarns",
  "wearables",
  "home decor",
  "toys & gifts",
  "freeform / art",
];

export const CROCHET_MOTIVATIONS = [
  "relaxation & stress relief",
  "gifts for loved ones",
  "making my own clothes",
  "home decor",
  "charity / community projects",
  "selling my makes",
  "learning & mastering skills",
  "meeting other makers",
];

const USERNAME_RE = /^[a-z0-9._-]{3,24}$/;

function normalizeChoices(raw, allowed, max = allowed.length) {
  if (!Array.isArray(raw)) raw = raw ? [raw] : [];
  return [...new Set(
    raw.map((v) => (typeof v === "string" ? v.trim().slice(0, 120) : "")).filter(Boolean)
  )].slice(0, Math.min(max, allowed.length));
}

function normalizeSocial(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 8)
    .map((link) => {
      const platform = clean(typeof link.platform === "string" ? link.platform : "other", 30) || "other";
      const handle = clean(typeof link.handle === "string" ? link.handle : "", 120);
      return { platform, handle };
    })
    .filter((link) => link.handle.length > 0);
}

export function normalizeProfile(body) {
  const patch = {};
  const errors = {};

  if ("name" in body) {
    const name = clean(body.name, 60);
    if (!name) errors.name = "Name is required";
    else patch.name = name;
  }
  if ("username" in body) {
    const username = clean(body.username, 24).toLowerCase();
    if (!username) {
      errors.username = "Username is required";
    } else if (!USERNAME_RE.test(username)) {
      errors.username = "Usernames are 3–24 characters, using letters, numbers, dots, underscores or dashes";
    } else {
      patch.username = username;
    }
  }
  if ("headline" in body) patch.headline = clean(body.headline, 120);
  if ("location" in body) patch.location = clean(body.location, 80);
  if ("country" in body) {
    const country = clean(body.country, 60);
    if (!country) {
      patch.country = "";
    } else if (!isValidCountry(country)) {
      errors.country = "Please pick a country from the list";
    } else {
      patch.country = country;
    }
  }
  if ("bio" in body) patch.bio = clean(body.bio, 600);
  if ("favoriteColors" in body) {
    const raw = Array.isArray(body.favoriteColors) ? body.favoriteColors.slice(0, 3) : [];
    patch.favoriteColors = raw
      .map((c) => (typeof c === "string" ? c.trim() : ""))
      .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c));
  }
  if ("goToYarn" in body) patch.goToYarn = clean(body.goToYarn, 80);
  if ("favoriteHookSize" in body) patch.favoriteHookSize = clean(body.favoriteHookSize, 40);
  if ("crafts" in body) {
    const raw = Array.isArray(body.crafts) ? body.crafts : [];
    patch.crafts = [
      ...new Set(
        raw
          .map((c) => (typeof c === "string" ? c.trim().toLowerCase() : ""))
          .filter((c) => CRAFT_OPTIONS.includes(c))
      ),
    ].slice(0, CRAFT_OPTIONS.length);
  }
  if ("hobbies" in body) {
    const raw = Array.isArray(body.hobbies) ? body.hobbies : [];
    patch.hobbies = [
      ...new Set(
        raw
          .map((h) => (typeof h === "string" ? h.trim().slice(0, 60).toLowerCase() : ""))
          .filter(Boolean)
      ),
    ].slice(0, 30);
  }
  if ("yearsExperience" in body) patch.yearsExperience = clean(body.yearsExperience, 40);
  if ("favoriteYarnBrand" in body) patch.favoriteYarnBrand = clean(body.favoriteYarnBrand, 80);
  if ("crochetTechniques" in body) {
    const chosen = normalizeChoices(body.crochetTechniques, CROCHET_TECHNIQUES);
    patch.crochetTechniques = chosen.filter((t) => CROCHET_TECHNIQUES.includes(t));
  }
  if ("crochetMotivation" in body) {
    const chosen = normalizeChoices(body.crochetMotivation, CROCHET_MOTIVATIONS);
    patch.crochetMotivation = chosen.filter((m) => CROCHET_MOTIVATIONS.includes(m));
  }
  if ("learningNext" in body) patch.learningNext = clean(body.learningNext, 160);
  if ("proudestProject" in body) patch.proudestProject = clean(body.proudestProject, 140);
  if ("bestGiftProject" in body) patch.bestGiftProject = clean(body.bestGiftProject, 140);
  QUIZ_QUESTIONS.forEach((q) => {
    if (!(q.field in body)) return;
    if (q.multiple) {
      patch[q.field] = normalizeChoices(body[q.field], q.options, q.options.length).filter((v) =>
        q.options.includes(v)
      );
    } else {
      patch[q.field] = clean(body[q.field], 120);
    }
  });
  if ("photoURL" in body) {
    const photoURL = typeof body.photoURL === "string" ? body.photoURL.trim().slice(0, 300000) : "";
    if (photoURL === "") {
      patch.photoURL = "";
    } else if (/^(https?:\/\/|data:image\/)/.test(photoURL)) {
      patch.photoURL = photoURL;
    } else {
      errors.photoURL = "Profile photo must be a valid URL or image";
    }
  }
  if ("coverPhotoURL" in body) {
    const coverPhotoURL = typeof body.coverPhotoURL === "string" ? body.coverPhotoURL.trim().slice(0, 300000) : "";
    if (coverPhotoURL === "") {
      patch.coverPhotoURL = "";
    } else if (/^(https?:\/\/|data:image\/)/.test(coverPhotoURL)) {
      patch.coverPhotoURL = coverPhotoURL;
    } else {
      errors.coverPhotoURL = "Cover photo must be a valid URL or image";
    }
  }
  if ("notifications" in body) {
    if (body.notifications === "on" || body.notifications === "off") {
      patch.notifications = body.notifications;
    } else {
      errors.notifications = "Notifications must be \"on\" or \"off\"";
    }
  }
  if ("profileVisibility" in body) {
    if (body.profileVisibility === "public" || body.profileVisibility === "private") {
      patch.profileVisibility = body.profileVisibility;
    } else {
      errors.profileVisibility = "Profile visibility must be \"public\" or \"private\"";
    }
  }
  if ("socialLinks" in body) {
    const links = normalizeSocial(body.socialLinks);
    if (links.length > 0) {
      patch.socialLinks = links.map((link) => ({
        platform: link.platform,
        handle: link.handle,
        url: buildSocialUrl(link.platform, link.handle),
      }));
    } else {
      patch.socialLinks = [];
    }
  }

  return { patch, errors };
}

export function profileChanged(prev, patch) {
  const changed = Object.keys(patch).filter((key) => prev?.[key] !== patch[key]);
  return { changed, hasChanges: changed.length > 0 };
}