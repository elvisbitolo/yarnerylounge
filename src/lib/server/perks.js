import { adminDb } from "@/lib/firebase/admin";
import { getAccessSub } from "@/lib/server/subscription";

export const TIER_RANK = {
  flirting: 1,
  "hooking-up": 2,
  "moving-in": 3,
  lounge: 1,
  plus: 2,
  host: 3,
};

export const SHOP_DISCOUNT = {
  code: "SECRET10",
  percent: 10,
  descriptionKey: "perks.shop.codeDescription",
};

export async function getPerkTier(uid) {
  const sub = await getAccessSub(uid);
  const tier = sub?.tier || "flirting";
  const rank = TIER_RANK[tier] || 1;
  return {
    tier,
    rank,
    isStaff: Boolean(sub?.isStaffAccess),
    isPlus: rank >= TIER_RANK.plus,
    isHost: rank >= TIER_RANK.host,
  };
}

export function hasPatternAccess(perkTier) {
  return Boolean(perkTier && perkTierAtLeast(perkTier, "plus"));
}

export function perkTierAtLeast(perkTier, minTier) {
  return (perkTier?.rank || 1) >= (TIER_RANK[minTier] || 1);
}

export function getMonthlyPattern() {
  const month = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
  return {
    key: "waffle-stitch-coaster-set",
    title: "Waffle Stitch Coaster Set",
    month,
    hook: "5.00 mm (H-8)",
    yarn: "Worsted weight cotton yarn, 2 colours (~40 g per colour)",
    finishedSize: "Each coaster ~10 cm square",
    skill: "Beginner-friendly",
    description:
      "A quick, satisfying make that puts this season's favourite texture to work. The waffle stitch gives a chunky, cushioned fabric, perfect for coasters, mug rugs, or a matching set to gift.",
    materials: [
      "Worsted weight cotton yarn (2 colours)",
      "5.00 mm (H-8) crochet hook",
      "Yarn needle",
      "Scissors",
    ],
    steps: [
      "Ch 26 loosely (foundation chain should not twist).",
      "Row 1: hdc in 3rd ch from hook and in each ch across. Turn. (24 sts)",
      "Row 2: ch 2 (counts as hdc). *fpdc in next st, hdc in next st; repeat from * to end. Turn.",
      "Repeat Row 2 until the piece is roughly square.",
      "Fasten off and weave in ends.",
      "Optional: join a contrasting border with sc around the edges.",
      "Block gently and repeat for your full set.",
      "Tip: keep your tension even for the waffle texture to pop.",
    ],
    tips: [
      "fpdc = front post double crochet",
      "hdc = half double crochet",
      "ch = chain, st(s) = stitch(es)",
    ],
  };
}

export async function listMembersOnlySessions(uid, limit = 5) {
  const perkTier = await getPerkTier(uid);
  if (!perkTierAtLeast(perkTier, "plus")) return [];

  const now = new Date();
  const snap = await adminDb()
    .collection("events")
    .where("startTime", ">=", now)
    .orderBy("startTime", "asc")
    .limit(50)
    .get();

  const sessions = snap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title || "Members-only session",
        startTime:
          data.startTime?.toMillis?.() || new Date(data.startTime || 0).getTime(),
        description: data.description || "",
        href: `/events/${doc.id}`,
        membersOnly: data.membersOnly === true,
      };
    })
    .filter((s) => s.membersOnly)
    .slice(0, limit);

  return sessions;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function buildPatternPdf(pattern) {
  const lines = [];
  lines.push(pattern.title.toUpperCase() + "  -  " + pattern.month);
  lines.push("");
  lines.push("Level: " + pattern.skill + "   |   Hook: " + pattern.hook);
  lines.push("");
  lines.push("Yarn:");
  lines.push("  " + pattern.yarn);
  lines.push("Finished size:");
  lines.push("  " + pattern.finishedSize);
  lines.push("");
  lines.push("Materials");
  pattern.materials.forEach((m) => lines.push("  - " + m));
  lines.push("");
  lines.push("Description");
  lines.push("  " + pattern.description);
  lines.push("");
  lines.push("Instructions");
  pattern.steps.forEach((step, i) => lines.push(i + 1 + ". " + step));
  lines.push("");
  lines.push("Pattern Notes");
  pattern.tips.forEach((tip) => lines.push("  - " + tip));
  lines.push("");
  lines.push("A Secret Yarnery member perk. Similar pattern PDFs arrive each month.");
  lines.push("Happy stitching!");
  if (pattern.key) lines.push("Pattern key: " + pattern.key);

  return buildTextPdf(lines);
}

export function buildTextPdf(lines) {
  const width = 612;
  const height = 792;
  const margin = 54;
  const lineHeight = 14;

  const objects = [];
  objects[1] = "<</Type/Catalog/Pages 2 0 R>>";
  objects[2] = "<</Type/Pages/Kids[3 0 R]/Count 1>>";
  objects[3] = "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>";
  objects[4] = "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>";

  const commands = ["BT", `1 0 0 1 ${margin} ${height - margin} Tm`, "11 Tf", "14 TL"];
  let y = height - margin;
  for (const raw of lines) {
    const x = raw.startsWith(" ") ? margin + 14 : margin;
    commands.push(`${x} ${y} Td (${esc(raw)}) Tj`);
    y -= lineHeight;
  }
  commands.push("ET");
  const content = commands.join("\n");
  objects[5] = `<</Length ${content.length}>>stream\n${content}\nendstream`;

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<</Size ${objects.length}/Root 1 0 R>>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}