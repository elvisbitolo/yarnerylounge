// Pure mapping helpers for the User storage cutover — no I/O, unit-testable.
// Converts a Prisma `User` row back into the exact doc shape that the
// rest of the server layer expects (getCurrentUser/getUserDoc consume this).
// All timestamps are emitted as epoch millis (like members-core.js), so
// consumers must handle number, Date and string timestamps — see toMillis.

// Normalizes any Date/string/number into epoch millis.
export function toMillis(value) {
  if (value == null) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

export function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || "",
    username: row.username || "",
    email: row.email || "",
    photoURL: row.photoURL || "",
    coverPhotoURL: row.coverPhotoURL || "",
    headline: row.headline || "",
    location: row.location || "",
    country: row.country || "",
    bio: row.bio || "",
    role: row.role || "member",
    roleLabel: row.roleLabel || "",
    plan: row.plan || "flirting",
    paymentStatus: row.paymentStatus || "unpaid",
    isPrePaid: row.isPrePaid || false,
    shopifyCustomerId: row.shopifyCustomerId || "",
    shopifyOrderId: row.shopifyOrderId || "",
    expiresAt: toMillis(row.expiresAt),
    firstName: row.firstName || "",
    lastName: row.lastName || "",
    phone: row.phone || "",
    favoriteColors: Array.isArray(row.favoriteColors) ? row.favoriteColors : [],
    crafts: Array.isArray(row.crafts) ? row.crafts : [],
    hobbies: Array.isArray(row.hobbies) ? row.hobbies : [],
    crochetTechniques: Array.isArray(row.crochetTechniques) ? row.crochetTechniques : [],
    skillLevel: row.skillLevel || "",
    craftInterests: Array.isArray(row.craftInterests) ? row.craftInterests : [],
    projectTypes: Array.isArray(row.projectTypes) ? row.projectTypes : [],
    yarnPreference: row.yarnPreference || "",
    hookSize: row.hookSize || "",
    communityGoals: Array.isArray(row.communityGoals) ? row.communityGoals : [],
    onboardingCompleted: row.onboardingCompleted || false,
    onboardingCompletedAt: toMillis(row.onboardingCompletedAt),
    yearsExperience: row.yearsExperience || "",
    favoriteYarnBrand: row.favoriteYarnBrand || "",
    crochetMotivation: Array.isArray(row.crochetMotivation) ? row.crochetMotivation : [],
    learningNext: row.learningNext || "",
    proudestProject: row.proudestProject || "",
    bestGiftProject: row.bestGiftProject || "",
    goToYarn: row.goToYarn || "",
    favoriteHookSize: row.favoriteHookSize || "",
    socialLinks: row.socialLinks && typeof row.socialLinks === "object" ? row.socialLinks : {},
    extra: row.extra && typeof row.extra === "object" ? row.extra : {},
    notifications: row.notifications || "",
    notificationPreferences:
      row.notificationPreferences && typeof row.notificationPreferences === "object"
        ? row.notificationPreferences
        : {},
    foundingMember: row.foundingMember || false,
    suspended: row.suspended || false,
    recognitionCount: row.recognitionCount || 0,
    createdAt: toMillis(row.createdAt),
    updatedAt: toMillis(row.updatedAt),
  };
}

// True when a paid plan's expiresAt has lapsed. Timestamp-agnostic so it works
// for dates stored as Timestamps, Dates, or epoch-millis numbers.
export function isPaidPlanExpired(
  userDoc,
  now = Date.now(),
  paidPlans = ["hooking-up", "moving-in"]
) {
  const plan = userDoc?.plan || "flirting";
  if (!paidPlans.includes(plan)) return false;
  const expiresAtMs = toMillis(userDoc?.expiresAt);
  return expiresAtMs > 0 && expiresAtMs < now;
}

export function mapUserForApi(row) {
  const u = mapUserRow(row);
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    photoURL: u.photoURL,
    coverPhotoURL: u.coverPhotoURL,
    headline: u.headline,
    location: u.location,
    country: u.country,
    bio: u.bio,
    role: u.role,
    roleLabel: u.roleLabel,
    plan: u.plan,
    paymentStatus: u.paymentStatus,
    foundingMember: u.foundingMember,
    skills: {
      skillLevel: u.skillLevel,
      yearsExperience: u.yearsExperience,
      crochetTechniques: u.crochetTechniques,
      favoriteHookSize: u.favoriteHookSize || u.hookSize,
      favoriteYarnBrand: u.favoriteYarnBrand,
      goToYarn: u.goToYarn,
      learningNext: u.learningNext,
      favoriteColors: u.favoriteColors,
      yarnPreference: u.yarnPreference,
    },
    interests: {
      hobbies: u.hobbies,
      crafts: u.crafts,
      craftInterests: u.craftInterests,
      projectTypes: u.projectTypes,
      crochetMotivation: u.crochetMotivation,
      communityGoals: u.communityGoals,
    },
    proudestProject: u.proudestProject,
    bestGiftProject: u.bestGiftProject,
    extra: u.extra,
    createdAt: u.createdAt,
  };
}