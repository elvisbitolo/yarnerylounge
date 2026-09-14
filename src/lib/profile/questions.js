export const QUIZ_QUESTIONS = [
  {
    field: "yarnType",
    question: "What's your yarn type?",
    multiple: true,
    options: [
      "Soft and squishy",
      "Natural and sophisticated",
      "Cheap and available",
      "Colorful and bold",
      "Everything — yarn is yarn!",
    ],
  },
  {
    field: "crochetLoveLanguage",
    question: "What are your crochet love languages?",
    multiple: true,
    options: [
      "Buying yarn",
      "Receiving yarn",
      "Uninterrupted crochet time",
      "Compliments on my work",
      "Someone weaving in my ends",
      "Teaching someone new",
    ],
  },
  {
    field: "idealFirstDate",
    question: "What is your ideal first date?",
    options: [
      "A yarn shop",
      "A craft fair",
      "Home with a WIP & wine",
      "Coffee and crocheting together",
      "A blanket and a movie",
    ],
  },
  {
    field: "crochetKnittingOpinion",
    question: "Could you have a serious relationship with someone who calls crochet \u201cknitting\u201d?",
    options: ["Yes", "No", "It's complicated\u2026"],
  },
  {
    field: "idealHookBrand",
    question: "What's your ideal hook-up?",
    options: ["Clover", "Tulip", "Furls", "JinLan", "Whatever's within reach"],
  },
  {
    field: "onlineYarnLetdown",
    question: "Ever fallen in love with a yarn online, only to be disappointed in person?",
    options: ["Guilty", "Innocent", "All the time!", "Never"],
  },
  {
    field: "yarnAttraction",
    question: "What do you find more attractive?",
    multiple: true,
    options: ["Gorgeous color", "Incredible softness", "A really good price"],
  },
  {
    field: "luxuryVsBargain",
    question: "One luxurious skein you adore, or ten bargain skeins you might use someday?",
    options: [
      "One luxurious skein I adore",
      "Ten bargain skeins",
      "Both!",
    ],
  },
  {
    field: "longestUFO",
    question: "What's the longest relationship you've had with a UFO (Unfinished Object)?",
    options: [
      "Under a month",
      "A few months",
      "Over a year",
      "It's basically furniture now",
    ],
  },
  {
    field: "weekendProject",
    question: "Long-term project, or something quick and easy for the weekend?",
    options: [
      "A long-term project",
      "Something quick for the weekend",
      "Both — I start 10, finish 1",
    ],
  },
  {
    field: "stitchPreferences",
    question: "Which stitches make your heart sing?",
    multiple: true,
    options: [
      "Single crochet",
      "Half double",
      "Double crochet",
      "Granny clusters",
      "Shells and fans",
      "Cables and textures",
      "I just follow the pattern!",
    ],
  },
  {
    field: "crochetScene",
    question: "Where do you crochet most?",
    options: [
      "On the couch",
      "In bed",
      "On the train / bus",
      "At cafés",
      "While watching TV",
      "In every meeting I'm in",
    ],
  },
  {
    field: "projectsThisYear",
    question: "How many projects have you finished this year?",
    options: [
      "None yet — I'm collecting WIPs",
      "1–3",
      "4–10",
      "A dozen or more",
      "I've lost count",
    ],
  },
  {
    field: "trends",
    question: "Which 2026 crochet trends are you most excited to try?",
    multiple: true,
    options: [
      "Filet & lace",
      "Tunisian crochet",
      "Textured stitches (waffle, puff, bobble)",
      "Granny square reinvention",
      "Chunky & oversized makes",
      "Amigurumi menagerie",
      "Gradient & self-striping yarns",
    ],
  },
];

export const QUIZ_LABELS = {
  yarnType: "Yarn type",
  crochetLoveLanguage: "Crochet love languages",
  idealFirstDate: "Ideal first date",
  crochetKnittingOpinion: "Crochet vs. knitting",
  idealHookBrand: "Ideal hook-up",
  onlineYarnLetdown: "Online yarn letdown",
  yarnAttraction: "What I find attractive",
  luxuryVsBargain: "Luxury or bargain",
  longestUFO: "Longest UFO relationship",
  weekendProject: "Project style",
  stitchPreferences: "Favourite stitches",
  crochetScene: "Where I crochet",
  projectsThisYear: "Projects this year",
  trends: "2026 trends I'm excited about",
};

function quizValue(member, field) {
  const value = member?.[field];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value || "").trim();
}

export function quizHasAnswers(member) {
  return QUIZ_QUESTIONS.some((q) => {
    const value = quizValue(member, q.field);
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });
}

export function quizAnswers(member) {
  if (!member) return {};
  return QUIZ_QUESTIONS.reduce((acc, q) => {
    acc[q.field] = quizValue(member, q.field);
    return acc;
  }, {});
}

export function quizAnswerLabel(q, member) {
  const value = quizValue(member, q.field);
  if (Array.isArray(value)) return value.join(" · ");
  return value;
}