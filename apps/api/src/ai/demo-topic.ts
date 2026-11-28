import type { Objective } from "@helpo/shared";
import { shortTitle } from "../common/short-title";
import type { LessonContext } from "./ai.provider";
import { isPromptOnly } from "./prompts";

/** Small, deterministic knowledge base the demo provider builds every resource from. */
export interface Term {
  term: string;
  def: string;
  page: number;
}

export interface DemoQuestion {
  type: "mcq" | "true_false" | "short";
  prompt: string;
  options: string[];
  answerIndex: number | null;
  answerText: string | null;
  explanation: string;
}

export interface Topic {
  plants: boolean;
  title: string;
  terms: Term[]; // always 10 or more
  questions: DemoQuestion[]; // always 10
  equationTiles: string[];
  sortBaskets: { yes: string; no: string };
  sortYes: string[];
  sortNo: string[];
}

export const isPlantTopic = (title: string) => /plant|photosynth|التمثيل الضوئي|النبات/i.test(title);

const PLANT_TERMS: Term[] = [
  { term: "Photosynthesis", def: "the way plants use light to make their own food", page: 2 },
  { term: "Sunlight", def: "the energy a plant captures to power photosynthesis", page: 3 },
  { term: "Chlorophyll", def: "the green substance in leaves that captures light", page: 3 },
  { term: "Roots", def: "the parts that take in water from the soil", page: 4 },
  { term: "Stomata", def: "tiny holes in a leaf that let gases move in and out", page: 4 },
  { term: "Carbon dioxide", def: "a gas from the air that plants take in", page: 5 },
  { term: "Glucose", def: "the sugar a plant makes as food", page: 5 },
  { term: "Oxygen", def: "the gas a plant releases during photosynthesis", page: 6 },
  { term: "Leaf", def: "the part of the plant where most photosynthesis happens", page: 3 },
  { term: "Stem", def: "the part that carries water up to the leaves", page: 4 },
];

const PLANT_QUESTIONS: DemoQuestion[] = [
  mcq("What do plants make during photosynthesis?", ["Glucose (sugar)", "Soil", "Rain", "Protein from the roots"], 0, "Plants make glucose, a sugar, which is their food."),
  mcq("Which part of a plant takes in water from the soil?", ["Leaves", "Roots", "Flowers", "Seeds"], 1, "Roots take in water and the stem carries it up to the leaves."),
  mcq("Which gas do plants take in from the air for photosynthesis?", ["Oxygen", "Nitrogen", "Carbon dioxide", "Helium"], 2, "Carbon dioxide enters the leaf through tiny holes called stomata."),
  mcq("Which gas do plants release during photosynthesis?", ["Carbon dioxide", "Oxygen", "Hydrogen", "Steam"], 1, "Oxygen is released as a by-product and goes out through the stomata."),
  mcq("What gives a plant the energy to make food?", ["Light from the Sun", "Moonlight", "Wind", "Cold"], 0, "Chlorophyll captures light energy from the Sun."),
  tf("Chlorophyll is the green substance that captures light.", true, "Chlorophyll gives leaves their green colour and captures light."),
  tf("Plants make their food in their roots.", false, "Most food is made in the leaves, where light and chlorophyll are."),
  mcq("Which word equation shows photosynthesis?", ["Glucose + oxygen -> carbon dioxide + water", "Carbon dioxide + water -> glucose + oxygen", "Water + oxygen -> glucose", "Sunlight + soil -> water"], 1, "Carbon dioxide and water, with light, make glucose and oxygen."),
  mcq(
    "Considering the chloroplast-mediated conversion of electromagnetic radiation into chemical energy, which input is indispensable?",
    ["Light energy", "Plastic", "Sand", "Salt"],
    0,
    "Light energy is the input that powers photosynthesis.",
  ),
  short("In your own words, why are plants called producers?", "Plants make their own food from light, water and carbon dioxide, so animals can eat them for energy.", "Plants make food that other living things use."),
];


/* Hand-written Modern Standard Arabic for the photosynthesis demo kit (offline Arabic). */
const PLANT_TERMS_AR: Term[] = [
  { term: "التمثيل الضوئي", def: "العملية التي تستخدم بها النباتات الضوء لصنع غذائها", page: 2 },
  { term: "ضوء الشمس", def: "الطاقة التي يلتقطها النبات لتشغيل التمثيل الضوئي", page: 3 },
  { term: "الكلوروفيل", def: "المادة الخضراء في الأوراق التي تلتقط الضوء", page: 3 },
  { term: "الجذور", def: "الأجزاء التي تمتص الماء من التربة", page: 4 },
  { term: "الثغور", def: "فتحات صغيرة في الورقة تسمح بمرور الغازات إلى الداخل والخارج", page: 4 },
  { term: "ثاني أكسيد الكربون", def: "غاز من الهواء تأخذه النباتات", page: 5 },
  { term: "الجلوكوز", def: "السكر الذي يصنعه النبات ليكون غذاءه", page: 5 },
  { term: "الأكسجين", def: "الغاز الذي يطلقه النبات أثناء التمثيل الضوئي", page: 6 },
  { term: "الورقة", def: "الجزء الذي يحدث فيه معظم التمثيل الضوئي", page: 3 },
  { term: "الساق", def: "الجزء الذي ينقل الماء إلى الأوراق", page: 4 },
];

const PLANT_QUESTIONS_AR: DemoQuestion[] = [
  mcq("ماذا تصنع النباتات أثناء التمثيل الضوئي؟", ["الجلوكوز (سكر)", "التربة", "المطر", "بروتين من الجذور"], 0, "تصنع النباتات الجلوكوز، وهو سكر يمثل غذاءها."),
  mcq("أي جزء من النبات يمتص الماء من التربة؟", ["الأوراق", "الجذور", "الأزهار", "البذور"], 1, "تمتص الجذور الماء وتنقله الساق إلى الأوراق."),
  mcq("أي غاز تأخذه النباتات من الهواء للتمثيل الضوئي؟", ["الأكسجين", "النيتروجين", "ثاني أكسيد الكربون", "الهيليوم"], 2, "يدخل ثاني أكسيد الكربون إلى الورقة عبر فتحات صغيرة تسمى الثغور."),
  mcq("أي غاز تطلقه النباتات أثناء التمثيل الضوئي؟", ["ثاني أكسيد الكربون", "الأكسجين", "الهيدروجين", "بخار الماء"], 1, "يُطلق الأكسجين كناتج ثانوي ويخرج عبر الثغور."),
  mcq("ما الذي يمنح النبات الطاقة لصنع الغذاء؟", ["ضوء الشمس", "ضوء القمر", "الرياح", "البرد"], 0, "يلتقط الكلوروفيل طاقة الضوء من الشمس."),
  tfAr("الكلوروفيل مادة خضراء تلتقط الضوء.", true, "يمنح الكلوروفيل الأوراق لونها الأخضر ويلتقط الضوء."),
  tfAr("تصنع النباتات غذاءها في جذورها.", false, "يُصنع معظم الغذاء في الأوراق، حيث الضوء والكلوروفيل."),
  mcq(
    "أي معادلة كلامية تعبّر عن التمثيل الضوئي؟",
    ["جلوكوز + أكسجين ← ثاني أكسيد الكربون + ماء", "ثاني أكسيد الكربون + ماء ← جلوكوز + أكسجين", "ماء + أكسجين ← جلوكوز", "ضوء الشمس + تربة ← ماء"],
    1,
    "ثاني أكسيد الكربون والماء، مع الضوء، يصنعان الجلوكوز والأكسجين.",
  ),
  mcq(
    "بالنظر إلى تحويل الإشعاع الكهرومغناطيسي إلى طاقة كيميائية بواسطة البلاستيدات الخضراء، ما المُدخل الذي لا غنى عنه؟",
    ["طاقة الضوء", "البلاستيك", "الرمل", "الملح"],
    0,
    "طاقة الضوء هي المُدخل الذي يشغّل التمثيل الضوئي.",
  ),
  short(
    "بأسلوبك، لماذا تسمى النباتات منتِجات؟",
    "تصنع النباتات غذاءها من الضوء والماء وثاني أكسيد الكربون، فتأكلها الحيوانات للحصول على الطاقة.",
    "تصنع النباتات غذاءً تستخدمه الكائنات الحية الأخرى.",
  ),
];

function tfAr(prompt: string, answer: boolean, explanation: string): DemoQuestion {
  return { type: "true_false", prompt, options: ["صحيح", "خطأ"], answerIndex: answer ? 0 : 1, answerText: null, explanation };
}

export const AR_STRINGS = { sortYes: "تحتاجه النباتات", sortNo: "لا تحتاجه النباتات" };

function mcq(prompt: string, options: string[], answerIndex: number, explanation: string): DemoQuestion {
  return { type: "mcq", prompt, options, answerIndex, answerText: null, explanation };
}
function tf(prompt: string, answer: boolean, explanation: string): DemoQuestion {
  return { type: "true_false", prompt, options: ["True", "False"], answerIndex: answer ? 0 : 1, answerText: null, explanation };
}
function short(prompt: string, answerText: string, explanation: string): DemoQuestion {
  return { type: "short", prompt, options: [], answerIndex: null, answerText, explanation };
}

/** First sentences of the teacher's source, used to keep generic content tied to what they wrote. */
export function sourceSentences(text: string, max: number): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 220)
    .slice(0, max);
}

/** Key concepts a teacher listed in the prompt ("Key concepts: phishing, passwords and malware"). */
export function promptConcepts(prompt: string | null | undefined): string[] {
  const m = (prompt ?? "").match(/key\s+(?:concepts?|ideas?|terms?|words?)\s*:\s*([^.\n]+)/i);
  if (!m) return [];
  return m[1]
    .split(/[,;]|\band\b/i)
    .map((c) => c.trim().replace(/^(?:the|a|an)\s+/i, "").trim())
    .filter((c) => c.length >= 3 && c.length <= 40)
    .map((c) => c[0].toUpperCase() + c.slice(1))
    .slice(0, 10);
}

/**
 * The topic the demo builds on. A prompt-only lesson whose title is missing or just class metadata ("Grade 11 Science")
 * takes its topic from the teacher's prompt, so a cyber security prompt never turns into a plants kit.
 */
export function demoTitle(ctx: LessonContext): string {
  const title = (ctx.title ?? "").trim();
  if (ctx.prompt && isPromptOnly(ctx) && (!title || /^(?:grade|year)\s*\d+/i.test(title))) return shortTitle(ctx.prompt);
  return title;
}

function genericTerms(title: string, objectives: Objective[], source: string, concepts: string[] = []): Term[] {
  const terms: Term[] = concepts.map((c, i) => ({ term: c, def: `an important idea in ${title.toLowerCase()}: ${c.toLowerCase()}`, page: i + 1 }));
  objectives.forEach((o, i) => terms.push({ term: `Key idea ${i + 1}`, def: lowerFirst(o.text.replace(/\.$/, "")), page: o.sourcePage ?? i + 1 }));
  sourceSentences(source, 12).forEach((s, i) => {
    if (terms.length < 10) terms.push({ term: `Point ${terms.length + 1}`, def: lowerFirst(s.replace(/[.!?]$/, "")), page: i + 1 });
  });
  const fillers = [
    { term: "Main idea", def: `the big idea of ${title}` },
    { term: "Key words", def: `the important words we use when we talk about ${title}` },
    { term: "Example", def: `a real situation that shows ${title}` },
    { term: "Evidence", def: `facts or observations that support what we say about ${title}` },
    { term: "Question", def: `something we ask to understand ${title} better` },
    { term: "Explanation", def: `a clear reason that tells how or why in ${title}` },
    { term: "Summary", def: `a short retelling of the most important points in ${title}` },
    { term: "Connection", def: `a link between ${title} and something we already know` },
    { term: "Vocabulary", def: `the special words that belong to ${title}` },
    { term: "Reflection", def: `thinking about what we learned in ${title}` },
  ];
  let f = 0;
  while (terms.length < 10) {
    const filler = fillers[f++];
    terms.push({ term: filler.term, def: filler.def, page: terms.length + 1 });
  }
  return terms;
}

const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

function genericQuestions(title: string, terms: Term[]): DemoQuestion[] {
  const defOptions = (i: number): { options: string[]; answerIndex: number } => {
    const wrong = [terms[(i + 3) % terms.length], terms[(i + 5) % terms.length], terms[(i + 7) % terms.length]].map((t) => t.def);
    const options = [...wrong];
    const at = i % 4;
    options.splice(at, 0, terms[i].def);
    return { options, answerIndex: at };
  };
  const qs: DemoQuestion[] = [];
  const mcqIdx = [0, 1, 2, 3, 4, 7];
  for (const i of mcqIdx) {
    const { options, answerIndex } = defOptions(i);
    qs.push(mcq(`Which sentence best tells what "${terms[i].term}" means in ${title}?`, options, answerIndex, `${terms[i].term} means ${terms[i].def}.`));
  }
  // Order: Q1-Q5 mcq, Q6-Q7 true/false, Q8 mcq, Q9 mcq (long wording), Q10 short.
  const ordered: DemoQuestion[] = [qs[0], qs[1], qs[2], qs[3], qs[4]];
  ordered.push(tf(`"${terms[0].term}" means ${terms[0].def}.`, true, `Yes: ${terms[0].term} means ${terms[0].def}.`));
  ordered.push(tf(`"${terms[1].term}" means ${terms[2].def}.`, false, `No: ${terms[1].term} means ${terms[1].def}.`));
  ordered.push(qs[5]);
  const q9 = defOptions(5);
  ordered.push(mcq(`Which of the following statements most accurately characterises "${terms[5].term}"?`, q9.options, q9.answerIndex, `${terms[5].term} means ${terms[5].def}.`));
  ordered.push(short(`In your own words, explain the main idea of ${title}.`, `A good answer uses the key words from the lesson and gives one example of ${title}.`, `Use the key words from the lesson to explain ${title}.`));
  return ordered;
}

export function buildTopic(rawCtx: LessonContext): Topic {
  const ctx = { ...rawCtx, title: demoTitle(rawCtx) };
  const plants = isPlantTopic(ctx.title);
  if (plants && ctx.locale === "ar") {
    return {
      plants,
      title: ctx.title,
      terms: PLANT_TERMS_AR,
      questions: PLANT_QUESTIONS_AR,
      equationTiles: ["ثاني أكسيد الكربون", "+", "الماء", "←", "الجلوكوز", "+", "الأكسجين"],
      sortBaskets: { yes: AR_STRINGS.sortYes, no: AR_STRINGS.sortNo },
      sortYes: ["ضوء الشمس", "الماء", "ثاني أكسيد الكربون", "الكلوروفيل"],
      sortNo: ["الشوكولاتة", "البلاستيك", "البيتزا"],
    };
  }
  if (plants) {
    return {
      plants,
      title: ctx.title,
      terms: PLANT_TERMS,
      questions: PLANT_QUESTIONS,
      equationTiles: ["carbon dioxide", "+", "water", "->", "glucose", "+", "oxygen"],
      sortBaskets: { yes: "Plants need", no: "Plants don't need" },
      sortYes: ["Sunlight", "Water", "Carbon dioxide", "Chlorophyll"],
      sortNo: ["Chocolate", "Plastic", "Pizza"],
    };
  }
  // Generators read the stored blueprint (as with Claude), so the cards and questions stay grounded even when the
  // lesson title changed after analysis (auto titles). Analysis itself derives terms from the title and source.
  const fromBlueprint: Term[] = (ctx.blueprint?.vocabulary ?? []).map((v, i) => ({
    term: v.term,
    meaning: v.meaning,
    page: ctx.blueprint?.keyConcepts[i]?.sourcePage ?? 1,
  })).map(({ term, meaning, page }) => ({ term, def: meaning, page }));
  const terms = fromBlueprint.length >= 10 ? fromBlueprint : genericTerms(ctx.title, ctx.objectives, ctx.sourceText || (isPromptOnly(ctx) ? "" : ctx.prompt ?? ""), isPromptOnly(ctx) ? promptConcepts(ctx.prompt) : []);
  return {
    plants,
    title: ctx.title,
    terms,
    questions: genericQuestions(ctx.title, terms),
    equationTiles: ["Learn", "->", "Practise", "->", "Apply"],
    sortBaskets: { yes: "Part of this lesson", no: "Not part of this lesson" },
    sortYes: terms.slice(0, 4).map((t) => t.term),
    sortNo: ["Football scores", "Pizza toppings", "Cartoon characters"],
  };
}
