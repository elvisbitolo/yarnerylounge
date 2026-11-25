// Resolves duplicate legacy member rows for a verified email without
// silently discarding a paid membership. Equal top-ranked candidates are
// deliberately treated as ambiguous and require manual support review.
const PLAN_RANK = { "moving-in": 3, "hooking-up": 2, flirting: 1 };

function scoreMember(member) {
  const subscriptionActive = ["active", "trialing"].includes(
    String(member?.subscription?.status || "").toLowerCase()
  );
  const paid = String(member?.paymentStatus || "").toLowerCase() === "paid";
  const plan = String(member?.plan || member?.subscription?.tier || "").toLowerCase();
  return [subscriptionActive ? 1 : 0, paid ? 1 : 0, PLAN_RANK[plan] || 0];
}

function compareScore(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return b[i] - a[i];
  }
  return 0;
}

export function selectEmailMember(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { member: null, ambiguous: false };
  }
  if (candidates.length === 1) return { member: candidates[0], ambiguous: false };

  const ranked = candidates
    .map((member) => ({ member, score: scoreMember(member) }))
    .sort((a, b) => compareScore(a.score, b.score));
  if (compareScore(ranked[0].score, ranked[1].score) === 0) {
    return { member: null, ambiguous: true };
  }
  return { member: ranked[0].member, ambiguous: false };
}
