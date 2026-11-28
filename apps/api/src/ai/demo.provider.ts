import { Injectable } from "@nestjs/common";
import type {
  AiCheckOut,
  CardsContent,
  GameContent,
  Blueprint,
  LessonPlan,
  RefinedPrompt,
  Locale,
  Objective,
  QuizContent,
  ReteachPlan,
  ResourceKind,
  Slide,
  SlidesContent,
  WorksheetContent,
} from "@helpo/shared";
import type { AiProvider, CheckText, RefineInput, GenerateOptions, GeneratedResource, LessonContext, LessonMeta, RewriteAction } from "./ai.provider";
import { worksheetItems, type ResourceContent } from "./content";
import { PROMPT_VERSIONS } from "./prompts/index";
import { buildTopic, demoTitle, isPlantTopic, sourceSentences, type Topic } from "./demo-topic";

const SIMPLE_WORDS: Record<string, string> = {
  utilize: "use",
  approximately: "about",
  demonstrate: "show",
  characterises: "describes",
  accurately: "best",
  indispensable: "needed",
  subsequently: "then",
  additionally: "also",
  "in order to": "to",
  consequently: "so",
  numerous: "many",
  commence: "start",
};

/** Deterministic simplifier used by the demo provider: short sentence, plain words. */
export function simplifyText(text: string): string {
  let out = text.trim();
  for (const [hard, easy] of Object.entries(SIMPLE_WORDS)) out = out.replace(new RegExp(`\\b${hard}\\b`, "gi"), easy);
  const first = out.split(/(?<=[.!?])\s+/)[0] ?? out;
  const words = first.split(/\s+/);
  const trimmed = words.length > 16 ? `${words.slice(0, 16).join(" ")}` : first;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** Keys whose values are identifiers or enums and must survive translation unchanged. */
const KEEP_KEYS = new Set(["id", "type", "visual", "bloom", "objectiveCode", "objectiveCodes", "code", "kind", "resource", "itemRef", "belongsInYes", "sourcePage", "difficulty", "language", "suggestedGameType", "gradeLevel", "layout", "tag", "level", "correct", "isTrue", "timeLimitSec", "points", "gridSize", "totalPoints", "emoji", "sourcePage"]);

/** Marked placeholder translation: every human-readable string gets a "[ar] " style prefix. */
export function placeholderTranslate<T>(value: T, to: Locale): T {
  const walk = (v: unknown, key?: string): unknown => {
    if (key && KEEP_KEYS.has(key)) return v;
    if (typeof v === "string") return v ? `[${to}] ${v}` : v;
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return walk(value) as T;
}

/** First `n` words of a text, with an ellipsis when it was cut. */
function cap(text: string, n: number): string {
  const w = text.trim().split(/\s+/);
  return w.length <= n ? text.trim() : `${w.slice(0, n).join(" ").replace(/[,;:]$/, "")}...`;
}

/** Strings for the v2 slide arc, per language (the Arabic set is hand-written for the plant lesson only). */
interface SlideStrings {
  hook: (title: string) => string;
  iCan: (objective: string) => string;
  goalsIdea: string;
  everyday: (term: string) => string;
  find: (term: string, page: number) => string;
  conceptEmoji: string[];
  image: (what: string) => string;
  steps: { title: string; detail: string }[];
  compareTitle: string;
  compareIdea: string;
  columns: { heading: string; points: string[] }[];
  exit: (term: string) => string;
}

/** The topic part of a lesson title: "Photosynthesis: how plants make food" -> "Photosynthesis". */
const topicOf = (title: string) => title.split(/[:：]/)[0].trim() || title;

const lowerFirstChar = (t: string) => (t ? t[0].toLowerCase() + t.slice(1) : t);

const SLIDE_EN: SlideStrings = {
  hook: (title) => `What do you already know about ${topicOf(title).toLowerCase()}?`,
  iCan: (o) => cap(`I can ${lowerFirstChar(o.trim().replace(/\.$/, ""))}`, 13),
  goalsIdea: "By the end, you will be able to do all of these.",
  everyday: (term) => `Think of where you meet ${term.toLowerCase()} every day.`,
  find: (term, page) => `Find ${term.toLowerCase()} on page ${page} of your notes.`,
  conceptEmoji: ["💡", "🔎"],
  image: (what) => `A friendly classroom illustration about ${what}`,
  steps: [
    { title: "Light arrives", detail: "The leaf catches sunlight." },
    { title: "Inputs come in", detail: "Water and carbon dioxide enter the plant." },
    { title: "Food is made", detail: "The plant makes glucose." },
    { title: "Oxygen leaves", detail: "Oxygen is released into the air." },
  ],
  compareTitle: "Inputs and outputs",
  compareIdea: "What goes in is not what comes out.",
  columns: [
    { heading: "Plants take in", points: ["Water", "Carbon dioxide", "Sunlight"] },
    { heading: "Plants make", points: ["Glucose", "Oxygen"] },
  ],
  exit: (term) => `In one sentence, what is ${term.toLowerCase()}?`,
};

const SLIDE_AR: SlideStrings = {
  hook: (title) => `ماذا تعرف مسبقاً عن «${topicOf(title)}»؟`,
  iCan: (o) => cap(`أستطيع أن ${o.trim().replace(/\.$/, "")}`, 13),
  goalsIdea: "في النهاية ستتمكن من كل هذه الأهداف.",
  everyday: (term) => `فكّر أين تقابل «${term}» في حياتك اليومية.`,
  find: (term, page) => `ابحث عن «${term}» في الصفحة ${page} من ملاحظاتك.`,
  conceptEmoji: ["💡", "🔎"],
  image: (what) => `رسم صفّي لطيف عن ${what}`,
  steps: [
    { title: "يصل الضوء", detail: "تلتقط الورقة ضوء الشمس." },
    { title: "تدخل المواد", detail: "يدخل الماء وثاني أكسيد الكربون إلى النبات." },
    { title: "يُصنع الغذاء", detail: "يصنع النبات الجلوكوز." },
    { title: "يخرج الأكسجين", detail: "يُطلق النبات الأكسجين في الهواء." },
  ],
  compareTitle: "المدخلات والمخرجات",
  compareIdea: "ما يدخل ليس هو ما يخرج.",
  columns: [
    { heading: "ما يأخذه النبات", points: ["الماء", "ثاني أكسيد الكربون", "ضوء الشمس"] },
    { heading: "ما يصنعه النبات", points: ["الجلوكوز", "الأكسجين"] },
  ],
  exit: (term) => `في جملة واحدة، ما «${term}»؟`,
};

/** Boilerplate strings for the demo kit builders, per language. */
interface Strings {
  gradeScience: (g: number) => string;
  minutes: (d: number) => string;
  welcome: string;
  learnTitle: string;
  learnNote: string;
  fallbackObjectives: (t: string) => string[];
  termBullet: (term: string, def: string) => string;
  findPage: (p: number) => string;
  termNote: (term: string) => string;
  equationTitle: string;
  equationBullets: string[];
  equationNote: string;
  puttingTitle: string;
  puttingNote: string;
  thinkTitle: string;
  thinkNote: string;
  summaryTitle: string;
  summaryNote: string;
  explore: (t: string) => string;
  fill: (def: string) => string;
  blank: (def: string) => string;
  draw: (t: string) => string;
  core: (t: string, title: string) => string;
  coreItem1: (t: string) => string;
  coreItem2: (t: string) => string;
  stretch: (a: string, b: string) => string;
  stretchItem: (a: string, b: string) => string;
  why: string;
  whyBack: (plants: boolean, title: string) => string;
  gameTitle: (plants: boolean, title: string) => string;
  termIs: (term: string, def: string) => string;
  oddWhy: (odd: string, title: string) => string;
  matchHeading: string;
  fillHeading: string;
  mcqHeading: string;
  shortHeading: string;
  worksheetInstructions: string;
  gameInstructions: string;
}

const EN: Strings = {
  gradeScience: (g) => `Grade ${g} science`,
  minutes: (d) => `${d} minute lesson`,
  welcome: "Welcome the class and ask what they already know.",
  learnTitle: "What we will learn",
  learnNote: "Read the goals aloud. Students tick them off at the end.",
  fallbackObjectives: (t) => [`Understand ${t}`, "Use the key words", "Apply it to an example"],
  termBullet: (term, def) => `${term} is ${def}.`,
  findPage: (p) => `Find it on page ${p} of your notes.`,
  termNote: (term) => `Give one example of ${term} before moving on.`,
  equationTitle: "The word equation",
  equationBullets: ["carbon dioxide + water -> glucose + oxygen", "Light is the energy that powers it."],
  equationNote: "Build the equation one tile at a time.",
  puttingTitle: "Putting it together",
  puttingNote: "Draw the connections on the board.",
  thinkTitle: "Think and talk",
  thinkNote: "Pairs discuss for one minute, then share.",
  summaryTitle: "Summary",
  summaryNote: "Ask students to say the summary in their own words.",
  explore: (t) => `Explore ${t}`,
  fill: (def) => `Fill in the blank using the word bank: ____ is ${def}.`,
  blank: (def) => `____ is ${def}.`,
  draw: (t) => `Draw and label ${t}.`,
  core: (t, title) => `Explain what ${t} is and why it matters in ${title}.`,
  coreItem1: (t) => `Write one sentence about ${t}.`,
  coreItem2: (t) => `Give one example of ${t}.`,
  stretch: (a, b) => `Compare ${a} with ${b}. How do they work together?`,
  stretchItem: (a, b) => `Write three sentences comparing ${a} and ${b}.`,
  why: "Why does it matter?",
  whyBack: (plants, title) => (plants ? "Plants make the food and oxygen that other living things need." : `${title} helps us explain what we see around us.`),
  gameTitle: (plants, title) => (plants ? "Plant parts match-up" : `${title}: match-up`),
  termIs: (term, def) => `${term} is ${def}.`,
  oddWhy: (odd, title) => `${odd} does not belong with the others: it is not part of ${title}.`,
  matchHeading: "Match the word to its meaning",
  fillHeading: "Fill in the blank",
  mcqHeading: "Choose the best answer",
  shortHeading: "Explain in your own words",
  worksheetInstructions: "Work through the sections in order. Ask for help if you get stuck.",
  gameInstructions: "Play the game to practise the key words. Try again if you miss one.",
};

const AR: Strings = {
  gradeScience: (g) => `علوم الصف ${g}`,
  minutes: (d) => `درس مدته ${d} دقيقة`,
  welcome: "رحّب بالصف واسأل عمّا يعرفونه مسبقاً.",
  learnTitle: "ماذا سنتعلم",
  learnNote: "اقرأ الأهداف بصوت عالٍ. يضع الطلاب علامة عليها في النهاية.",
  fallbackObjectives: (t) => [`فهم ${t}`, "استخدام الكلمات الأساسية", "تطبيقه على مثال"],
  termBullet: (term, def) => `${term}: ${def}.`,
  findPage: (p) => `ابحث عنه في الصفحة ${p} من ملاحظاتك.`,
  termNote: (term) => `أعطِ مثالاً واحداً على «${term}» قبل الانتقال.`,
  equationTitle: "المعادلة الكلامية",
  equationBullets: ["ثاني أكسيد الكربون + الماء ← الجلوكوز + الأكسجين", "الضوء هو الطاقة التي تشغّل العملية."],
  equationNote: "ابنِ المعادلة قطعة قطعة.",
  puttingTitle: "نجمع الأفكار",
  puttingNote: "ارسم الروابط على السبورة.",
  thinkTitle: "فكّر وتحدّث",
  thinkNote: "يتناقش الطلاب في أزواج دقيقة واحدة ثم يشاركون.",
  summaryTitle: "الملخص",
  summaryNote: "اطلب من الطلاب قول الملخص بأسلوبهم.",
  explore: (t) => `استكشف: ${t}`,
  fill: (def) => `أكمل الفراغ مستخدماً بنك الكلمات: ____ هو ${def}.`,
  blank: (def) => `____ هو ${def}.`,
  draw: (t) => `ارسم ${t} وسمِّ أجزاءه.`,
  core: (t, title) => `اشرح ما هو «${t}» ولماذا هو مهم في «${title}».`,
  coreItem1: (t) => `اكتب جملة واحدة عن «${t}».`,
  coreItem2: (t) => `أعطِ مثالاً واحداً على «${t}».`,
  stretch: (a, b) => `قارن بين «${a}» و«${b}». كيف يعملان معاً؟`,
  stretchItem: (a, b) => `اكتب ثلاث جمل تقارن بين «${a}» و«${b}».`,
  why: "لماذا هذا مهم؟",
  whyBack: (plants, title) => (plants ? "تصنع النباتات الغذاء والأكسجين اللذين تحتاجهما الكائنات الحية الأخرى." : `يساعدنا ${title} على تفسير ما نراه حولنا.`),
  gameTitle: (plants, title) => (plants ? "مطابقة أجزاء النبات" : `${title}: مطابقة`),
  termIs: (term, def) => `${term}: ${def}.`,
  oddWhy: (odd, title) => `${odd} لا ينتمي إلى البقية: فهو ليس جزءًا من ${title}.`,
  matchHeading: "طابِق الكلمة بمعناها",
  fillHeading: "أكمل الفراغ",
  mcqHeading: "اختر أفضل إجابة",
  shortHeading: "اشرح بأسلوبك",
  worksheetInstructions: "أنجز الأقسام بالترتيب واطلب المساعدة عند الحاجة.",
  gameInstructions: "العب لتتدرّب على الكلمات الأساسية، وأعد المحاولة إن أخطأت.",
};

/** Hand-written Arabic for the photosynthesis review flags; English for any other locale. */
function plantChecks(ctx: LessonContext, topic: Topic, quiz: QuizContent | undefined, sheet: WorksheetContent | undefined, locale: Locale): AiCheckOut[] {
  const ar = locale === "ar";
  const checks: AiCheckOut[] = [];
  if (quiz && quiz.questions.length >= 9) {
    const q4 = quiz.questions[3];
    checks.push({
      resource: "QUIZ",
      itemRef: "Q4",
      kind: "FACT_CHECK",
      message: ar
        ? `السؤال 4: «${q4.prompt}» تحقق من مفتاح الإجابة مقابل الصفحة 6 من مصدرك، فالصياغة هناك مختلفة قليلاً.`
        : `Q4 asks "${q4.prompt}" Check the answer key against page 6 of your source: the wording there is slightly different.`,
      suggestion: null,
      sourcePage: 6,
    });
    checks.push({
      resource: "QUIZ",
      itemRef: "Q9",
      kind: "READING_LEVEL",
      message: ar ? `السؤال 9 أعلى من مستوى القراءة المناسب للصف ${ctx.grade}. صياغة أبسط جاهزة.` : `Q9 reads above grade ${ctx.grade} level for this class. A simpler wording is ready.`,
      suggestion: ar ? "ما المُدخل الذي يمنح النبات الطاقة لصنع غذائه؟" : topic.plants ? "Which input gives a plant the energy to make food?" : simplifyText(quiz.questions[8].prompt),
      sourcePage: null,
    });
  }
  const sheetItems = sheet ? worksheetItems(sheet) : [];
  if (sheet && sheetItems.length >= 5) {
    const t = topic.terms[4];
    checks.push({
      resource: "WORKSHEET",
      itemRef: "A5",
      kind: "ORDER",
      message: ar ? `النشاط 5 يستخدم كلمة «${t.term}» قبل أن تشرحها الشرائح. انقل النشاط لاحقاً أو أضف تلميحاً.` : `A5 uses the word "${t.term}" before the slides teach it. Move the activity later or add a hint.`,
      suggestion: ar
        ? `${sheetItems[4].prompt} (تلميح: ابحث عن «${t.term}» في بطاقاتك أولاً.)`
        : `${sheetItems[4].prompt} (Hint: look up "${t.term}" on your cards first.)`,
      sourcePage: t.page,
    });
  }
  return checks;
}

/**
 * Offline provider: realistic, schema-valid content built from the lesson title and objectives.
 * Used when ANTHROPIC_API_KEY is missing or AI_MODE=demo, so the whole app works without network.
 * Arabic is hand-written for the photosynthesis kit; other Arabic output is a marked placeholder.
 */
@Injectable()
export class DemoAiProvider implements AiProvider {
  readonly mode = "demo" as const;

  async analyze(ctx: LessonContext): Promise<Blueprint> {
    const plan = await this.plan(ctx);
    const topic = buildTopic(ctx);
    const ar = ctx.locale === "ar";
    return {
      title: plan.title,
      subject: ar ? "العلوم" : "Science",
      gradeLevel: `Grade ${ctx.grade}`,
      language: ctx.locale,
      summary: plan.summary,
      standard: plan.standard,
      objectives: plan.objectives,
      keyConcepts: topic.terms.slice(0, 15).map((t) => ({ name: t.term, definition: t.def, sourcePage: t.page })),
      vocabulary: topic.terms.slice(0, 15).map((t) => ({ term: t.term, meaning: t.def })),
      processes: [{ name: ar ? "العملية" : "The process", steps: topic.equationTiles.filter((t) => !["+", "->", "←"].includes(t)) }],
      relations: topic.terms.slice(0, 6).map((t) => ({ left: t.term, right: t.def })),
      commonMisconceptions: topic.plants
        ? [ar ? "تأخذ النباتات غذاءها من التربة." : "Plants eat soil.", ar ? "الأكسجين هو غذاء النبات." : "Oxygen is the food a plant makes."]
        : [`${topic.title} is only about memorising words.`, `One example is enough to explain all of ${topic.title}.`],
      difficulty: ctx.grade <= 5 ? "easy" : ctx.grade <= 8 ? "medium" : "hard",
      suggestedGameType: topic.plants ? "matching" : "memory",
    };
  }

  /** Demo analysis never needs map-reduce: a chunk is analysed like the whole. */
  async analyzeChunk(ctx: LessonContext, chunk: string): Promise<Blueprint> {
    return this.analyze({ ...ctx, sourceText: chunk });
  }

  async reduceBlueprints(_ctx: LessonContext, parts: Blueprint[]): Promise<Blueprint> {
    return parts[0];
  }

  async countTokens(text: string): Promise<number> {
    return Math.ceil(text.length / 4);
  }

  /** No scanned-PDF reading in demo mode. */
  async transcribePdf(): Promise<string> {
    return "";
  }

  private async plan(rawCtx: LessonContext): Promise<LessonPlan> {
    const ctx = { ...rawCtx, title: demoTitle(rawCtx) };
    const plants = isPlantTopic(ctx.title);
    const ar = ctx.locale === "ar";
    const sentences = sourceSentences(ctx.sourceText, 3);
    let plan: LessonPlan;
    if (plants) {
      const objectives: Objective[] = ar
        ? [
            { code: "O1", text: "تسمية مدخلات ومخرجات التمثيل الضوئي.", bloom: "remember", sourcePage: 2 },
            { code: "O2", text: "شرح كيف تُستخدم طاقة الضوء والماء وثاني أكسيد الكربون لصنع الجلوكوز.", bloom: "understand", sourcePage: 4 },
            { code: "O3", text: "إكمال المعادلة الكلامية للتمثيل الضوئي.", bloom: "apply", sourcePage: 5 },
            { code: "O4", text: "وصف سبب تسمية النباتات منتِجات.", bloom: "understand", sourcePage: 6 },
          ]
        : [
            { code: "O1", text: "Name the inputs and outputs of photosynthesis.", bloom: "remember", sourcePage: 2 },
            { code: "O2", text: "Explain how light, water and carbon dioxide are used to make glucose.", bloom: "understand", sourcePage: 4 },
            { code: "O3", text: "Complete the word equation for photosynthesis.", bloom: "apply", sourcePage: 5 },
            { code: "O4", text: "Describe why plants are called producers.", bloom: "understand", sourcePage: 6 },
          ];
      plan = {
        title: ctx.title,
        standard: "NGSS MS-LS1-6",
        objectives,
        summary: ar
          ? "يتعلم الطلاب كيف تلتقط النباتات الضوء وتأخذ الماء وثاني أكسيد الكربون لتصنع الجلوكوز والأكسجين. ثم يكتبون المعادلة الكلامية."
          : "Students learn how plants capture light, take in water and carbon dioxide, and make glucose and oxygen. They finish by writing the word equation.",
      };
    } else {
      plan = {
        title: ctx.title,
        standard: null,
        objectives: [
          { code: "O1", text: `Explain the main ideas of ${ctx.title}.`, bloom: "understand", sourcePage: 1 },
          { code: "O2", text: `Use the key words of ${ctx.title} correctly.`, bloom: "remember", sourcePage: 2 },
          { code: "O3", text: `Apply ${ctx.title} to a new example.`, bloom: "apply", sourcePage: sentences.length ? 3 : null },
        ],
        summary: `Students build a clear understanding of ${ctx.title}. They practise the key words and apply them to an example.`,
      };
      if (ar) plan = { ...placeholderTranslate(plan, "ar"), standard: null };
    }
    return plan;
  }

  async generateResource(kind: ResourceKind, ctx: LessonContext, opts: GenerateOptions = {}): Promise<GeneratedResource> {
    const built = await this.build(kind, ctx);
    if (kind === "QUIZ" && opts.quizCount) {
      const q = built as QuizContent;
      return { content: { questions: q.questions.slice(0, Math.max(5, Math.min(opts.quizCount, q.questions.length))) }, usage: { model: "demo", promptVersion: "quiz.v1", tokensIn: 0, tokensOut: 0 } };
    }
    return { content: built, usage: { model: "demo", promptVersion: PROMPT_VERSIONS[kind], tokensIn: 0, tokensOut: 0 } };
  }

  private async build(kind: ResourceKind, ctx: LessonContext): Promise<ResourceContent> {
    const plants = isPlantTopic(demoTitle(ctx));
    if (ctx.locale === "ar" && !plants) {
      const english = await this.build(kind, { ...ctx, locale: "en" });
      return placeholderTranslate(english, "ar");
    }
    const topic = buildTopic(ctx);
    const S = ctx.locale === "ar" ? AR : EN;
    switch (kind) {
      case "SLIDES":
        return this.slides(ctx, topic, S);
      case "WORKSHEET":
        return this.worksheet(ctx, topic, S);
      case "QUIZ":
        return this.quiz(ctx, topic);
      case "GAME":
        return this.game(topic, S);
      case "CARDS":
        return this.cards(ctx, topic, S);
    }
  }

  async generateChecks(ctx: LessonContext, resources: Partial<Record<ResourceKind, ResourceContent>>): Promise<AiCheckOut[]> {
    const plants = isPlantTopic(ctx.title);
    if (ctx.locale === "ar" && !plants) {
      const en = await this.generateChecks({ ...ctx, locale: "en" }, resources);
      return en.map((c) => ({ ...c, message: `[ar] ${c.message}`, suggestion: c.suggestion ? `[ar] ${c.suggestion}` : null }));
    }
    return plantChecks(ctx, buildTopic(ctx), resources.QUIZ as QuizContent | undefined, resources.WORKSHEET as WorksheetContent | undefined, ctx.locale);
  }

  async rewrite(ctx: LessonContext, text: string, action: RewriteAction, language?: string): Promise<string> {
    switch (action) {
      case "simpler":
        return simplifyText(text);
      case "example": {
        const topic = buildTopic(ctx);
        return `${text.trim()} For example, ${topic.plants ? "a bean plant on a sunny window sill makes its own sugar from light, water and air" : `think of a real situation that shows ${ctx.title}`}.`;
      }
      case "translate":
        return `[${language ?? ctx.language}] ${text.trim()}`;
      case "regenerate":
        return `Here is another way to say it: ${simplifyText(text)}`;
    }
  }

  async changeRequest(
    _ctx: LessonContext,
    kind: ResourceKind,
    content: ResourceContent,
    request: string,
  ): Promise<{ summary: string; content: ResourceContent }> {
    if (!/easier|simpler|shorter|simplif/i.test(request)) {
      return { summary: `Noted: "${request.slice(0, 60)}"`, content };
    }
    const copy = structuredClone(content);
    switch (kind) {
      case "QUIZ":
        (copy as QuizContent).questions.forEach((q) => (q.prompt = simplifyText(q.prompt)));
        break;
      case "SLIDES":
        (copy as SlidesContent).slides.forEach((s) => {
          s.bullets = s.bullets.map(simplifyText);
          if (s.definition) s.definition = simplifyText(s.definition);
          if (s.takeaways) s.takeaways = s.takeaways.map(simplifyText);
        });
        break;
      case "CARDS":
        (copy as CardsContent).cards.forEach((c) => (c.back = simplifyText(c.back)));
        break;
      case "WORKSHEET":
        worksheetItems(copy as WorksheetContent).forEach((it) => (it.prompt = simplifyText(it.prompt)));
        break;
      case "GAME":
        break;
    }
    return { summary: "Made the wording simpler", content: copy };
  }

  /** Photosynthesis kits are regenerated from the hand-written Arabic/English topic; anything else gets a marked placeholder. */
  async translateContent(kind: ResourceKind, content: ResourceContent, ctx: LessonContext, to: Locale): Promise<ResourceContent> {
    if (!isPlantTopic(ctx.title)) return placeholderTranslate(content, to);
    return this.build(kind, await this.plantContext(ctx, to));
  }

  private async plantContext(ctx: LessonContext, to: Locale): Promise<LessonContext> {
    const title = to === "ar" ? PLANT_TITLE_AR : PLANT_TITLE_EN;
    const plan = await this.plan({ ...ctx, title, locale: to });
    return { ...ctx, title, locale: to, objectives: plan.objectives };
  }

  async translateMeta(meta: LessonMeta, ctx: LessonContext, to: Locale): Promise<LessonMeta> {
    if (isPlantTopic(meta.title) || isPlantTopic(ctx.title)) {
      const plan = await this.plan({ ...ctx, title: meta.title, locale: to });
      const unit = meta.unitTitle && /plants and energy|النباتات والطاقة/i.test(meta.unitTitle) ? (to === "ar" ? "النباتات والطاقة" : "Plants and energy") : meta.unitTitle ? placeholderTranslate(meta.unitTitle, to) : null;
      return {
        title: to === "ar" ? PLANT_TITLE_AR : PLANT_TITLE_EN,
        unitTitle: unit,
        description: plan.summary,
        objectives: plan.objectives,
      };
    }
    return {
      title: `[${to}] ${meta.title}`,
      unitTitle: meta.unitTitle ? `[${to}] ${meta.unitTitle}` : null,
      description: meta.description ? `[${to}] ${meta.description}` : null,
      objectives: placeholderTranslate(meta.objectives, to),
    };
  }

  async translateChecks(checks: CheckText[], ctx: LessonContext, to: Locale): Promise<CheckText[]> {
    if (!isPlantTopic(ctx.title)) return checks.map((c) => ({ itemRef: c.itemRef, message: `[${to}] ${c.message}`, suggestion: c.suggestion ? `[${to}] ${c.suggestion}` : null }));
    const topicCtx = await this.plantContext(ctx, to);
    const quiz = (await this.build("QUIZ", topicCtx)) as QuizContent;
    const sheet = (await this.build("WORKSHEET", topicCtx)) as WorksheetContent;
    const known = new Map(plantChecks(topicCtx, buildTopic(topicCtx), quiz, sheet, to).map((c) => [c.itemRef, c]));
    return checks.map((c) => {
      const k = known.get(c.itemRef);
      return k ? { itemRef: c.itemRef, message: k.message, suggestion: k.suggestion } : { itemRef: c.itemRef, message: `[${to}] ${c.message}`, suggestion: c.suggestion ? `[${to}] ${c.suggestion}` : null };
    });
  }

  /** Deterministic refinement: same input, same brief. */
  async refinePrompt(input: RefineInput): Promise<RefinedPrompt> {
    const raw = input.prompt.replace(/\s+/g, " ").trim();
    const ar = input.locale === "ar";
    const grade = input.grade ? (ar ? `الصف ${input.grade}` : `Grade ${input.grade}`) : ar ? "الصف المناسب" : "the class";
    const minutes = input.durationMin ?? 45;
    const prompt = ar
      ? `درس عن: ${raw.slice(0, 240)}. ${grade}، ${input.subject ?? "علوم"}، ${minutes} دقيقة. ركّز على المفاهيم الأساسية، وأضف نشاطاً قصيراً واحداً، وتحقّق من فهم خاطئ شائع.`
      : `Lesson on: ${raw.slice(0, 240)}. ${grade}, ${input.subject ?? "Science"}, ${minutes} minutes. Cover the key concepts, include one short hands-on activity, and check one common misconception.`;
    return {
      prompt: prompt.slice(0, 600),
      suggestions: ar ? ["+ أضف تجربة", "+ أضف مفردات", "+ أضف سؤال نقاش"] : ["+ Add an experiment", "+ Add vocabulary", "+ Add a discussion question"],
    };
  }

  async reteachPlan(ctx: LessonContext, weak: { objectiveCode: string; objectiveText: string; misconception: string | null }): Promise<ReteachPlan> {
    const topic = buildTopic(ctx);
    const key = topic.terms[0];
    const plan: ReteachPlan = {
      warmUpTitle: `Quick reset: ${weak.objectiveText.replace(/\.$/, "")}`,
      warmUpSteps: [
        `Ask: "What does ${key.term} mean?" and let pairs answer in one sentence.`,
        weak.misconception ? `Show the common mix-up: ${weak.misconception}` : "Show one clear picture or example from your slides.",
        "Re-ask the question that most students missed and compare answers.",
      ],
      smallGroupTask: `Groups of three build a one-minute explanation of ${weak.objectiveCode} using the cards, then teach another group.`,
      targetObjectiveCode: weak.objectiveCode,
    };
    return ctx.locale === "ar" ? { ...placeholderTranslate(plan, "ar"), targetObjectiveCode: weak.objectiveCode } : plan;
  }

  /* ----------------------------- builders ----------------------------- */

  private code(ctx: LessonContext, i: number): string {
    return ctx.objectives.length ? ctx.objectives[i % ctx.objectives.length].code : `O${(i % 3) + 1}`;
  }

  /** The v2 teaching arc: hook, goals, concepts, definitions, process, compare, two checks, summary with an exit ticket. */
  private slides(ctx: LessonContext, topic: Topic, S: Strings): SlidesContent {
    const D = ctx.locale === "ar" && topic.plants ? SLIDE_AR : SLIDE_EN;
    const T = topic.terms;
    const blank = { subtitle: null, keyIdea: null, bullets: [] as string[], columns: null, term: null, definition: null, example: null, steps: null, question: null, options: null, answerIndex: null, takeaways: null, imagePrompt: null, emoji: null as string | null };
    const mk = (layout: Slide["layout"], title: string, speakerNotes: string, codes: string[], extra: Partial<Slide> = {}): Slide => ({ ...blank, layout, title, speakerNotes, objectiveCodes: codes, ...extra });
    const goals = ctx.objectives.length ? ctx.objectives.map((o) => D.iCan(o.text)) : S.fallbackObjectives(ctx.title).map((o) => D.iCan(o));
    const slides: Slide[] = [
      mk("title", ctx.title, S.welcome, [], { subtitle: `${S.gradeScience(ctx.grade)} - ${S.minutes(ctx.durationMin)}`, question: D.hook(ctx.title), emoji: topic.plants ? "🌱" : "📘", imagePrompt: D.image(ctx.title) }),
      mk("bullets", S.learnTitle, S.learnNote, ctx.objectives.map((o) => o.code), { bullets: goals.slice(0, 5), keyIdea: D.goalsIdea, emoji: "🎯", imagePrompt: D.image(S.learnTitle) }),
    ];
    T.slice(0, 2).forEach((t, i) => {
      slides.push(mk("bullets", t.term, S.termNote(t.term), [this.code(ctx, i)], { keyIdea: cap(S.termIs(t.term, t.def), 18), bullets: [D.everyday(t.term), D.find(t.term, t.page)], emoji: D.conceptEmoji[i % D.conceptEmoji.length], imagePrompt: D.image(t.term) }));
    });
    T.slice(2, 5).forEach((t, i) => {
      slides.push(mk("definition", t.term, S.termNote(t.term), [this.code(ctx, i + 2)], { term: t.term, definition: cap(t.def, 20), example: S.findPage(t.page), emoji: "📖", imagePrompt: D.image(t.term) }));
    });
    if (topic.plants) {
      slides.push(mk("process", S.equationTitle, S.equationNote, [this.code(ctx, 2)], { steps: D.steps, emoji: "☀️", imagePrompt: D.image(S.equationTitle) }));
      slides.push(mk("twoColumn", D.compareTitle, S.puttingNote, [this.code(ctx, 1)], { keyIdea: D.compareIdea, columns: D.columns, emoji: "⚖️", imagePrompt: D.image(D.compareTitle) }));
    } else {
      slides.push(mk("twoColumn", S.puttingTitle, S.puttingNote, [this.code(ctx, 1)], { keyIdea: D.compareIdea, columns: T.slice(5, 7).map((t) => ({ heading: t.term, points: [cap(t.def, 12), S.findPage(t.page)] })), emoji: "⚖️", imagePrompt: D.image(S.puttingTitle) }));
    }
    const mcqs = topic.questions.filter((q) => q.type === "mcq" && q.options.length >= 3 && q.answerIndex !== null);
    mcqs.slice(0, 2).forEach((q, i) => {
      const options = q.options.slice(0, 4).map((o) => cap(o, 14));
      slides.push(mk("quizBreak", S.thinkTitle, S.thinkNote, [this.code(ctx, i)], { question: q.prompt, options, answerIndex: Math.min(q.answerIndex ?? 0, options.length - 1), keyIdea: cap(q.explanation, 18), emoji: "❓", imagePrompt: null }));
    });
    slides.push(mk("summary", S.summaryTitle, S.summaryNote, ctx.objectives.map((o) => o.code), { takeaways: T.slice(0, 3).map((t) => cap(`${t.term}: ${t.def}`, 16)), question: D.exit(T[0].term), emoji: "✅", imagePrompt: null }));
    return { deckTitle: ctx.title, slides };
  }

  private worksheet(ctx: LessonContext, topic: Topic, S: Strings): WorksheetContent {
    const T = topic.terms;
    const mcqs = topic.questions.filter((q) => q.type === "mcq").slice(0, 3);
    const sections: WorksheetContent["sections"] = [
      {
        type: "matching",
        heading: S.matchHeading,
        level: "support",
        objectiveCode: this.code(ctx, 0),
        items: T.slice(0, 4).map((t) => ({ prompt: t.term, options: T.slice(0, 4).map((x) => x.def), answer: t.def, points: 1 })),
      },
      {
        type: "fill",
        heading: S.fillHeading,
        level: "core",
        objectiveCode: this.code(ctx, 1),
        items: T.slice(4, 8).map((t) => ({ prompt: S.blank(t.def), options: null, answer: t.term, points: 1 })),
      },
      {
        type: "mcq",
        heading: S.mcqHeading,
        level: "core",
        objectiveCode: this.code(ctx, 2),
        items: mcqs.map((q) => ({ prompt: q.prompt, options: q.options, answer: q.options[q.answerIndex ?? 0], points: 2 })),
      },
      {
        type: "short",
        heading: S.shortHeading,
        level: "stretch",
        objectiveCode: this.code(ctx, 3),
        items: [
          { prompt: S.core(T[0].term, ctx.title), options: null, answer: S.termIs(T[0].term, T[0].def), points: 3 },
          { prompt: S.stretch(T[1].term, T[2].term), options: null, answer: S.termIs(T[1].term, T[1].def), points: 4 },
        ],
      },
    ];
    const totalPoints = sections.flatMap((s) => s.items).reduce((n, it) => n + it.points, 0);
    return { title: S.explore(ctx.title), instructions: S.worksheetInstructions, sections, totalPoints };
  }

  private quiz(ctx: LessonContext, topic: Topic): QuizContent {
    return {
      questions: topic.questions.map((q, i) => ({
        id: `Q${i + 1}`,
        type: q.type === "true_false" ? ("tf" as const) : q.type,
        prompt: q.prompt,
        options: q.type === "short" ? null : q.options.map((text, k) => ({ text, correct: k === q.answerIndex })),
        acceptedAnswers: q.type === "short" ? [q.answerText ?? ""] : null,
        pairs: null,
        explanation: q.explanation,
        concept: topic.terms[i % topic.terms.length].term,
        objectiveCode: this.code(ctx, i),
        difficulty: i < 3 ? ("easy" as const) : i < 8 ? ("medium" as const) : ("hard" as const),
        timeLimitSec: q.type === "short" ? 60 : q.type === "true_false" ? 20 : 30,
      })),
    };
  }

  private game(topic: Topic, S: Strings): GameContent {
    const yes = topic.sortYes.map((label) => ({ label, belongsInYes: true }));
    const no = topic.sortNo.map((label) => ({ label, belongsInYes: false }));
    const T = topic.terms;
    return {
      type: topic.plants ? "matching" : "memory",
      title: S.gameTitle(topic.plants, topic.title),
      instructions: S.gameInstructions,
      timeLimitSec: null,
      pairs: T.slice(0, 7).map((t) => ({ left: t.term, right: t.def })),
      gridSize: 14,
      sortBaskets: topic.sortBaskets,
      sortItems: [yes[0], no[0], yes[1], no[1], yes[2], no[2], yes[3]],
      equationTiles: topic.equationTiles,
      oddOneOut: [0, 1, 2, 3].map((r) => {
        const odd = topic.sortNo[r % topic.sortNo.length];
        const same = [0, 1, 2].map((k) => T[(r * 3 + k) % T.length].term);
        const oddIndex = (r + 1) % 4;
        const items = [...same];
        items.splice(oddIndex, 0, odd);
        return { items, oddIndex, explanation: S.oddWhy(odd, topic.title) };
      }),
      statements: T.slice(0, 6).map((t, i) =>
        i % 2 === 0
          ? { text: S.termIs(t.term, t.def), isTrue: true, explanation: S.termIs(t.term, t.def) }
          : { text: S.termIs(t.term, T[(i + 3) % T.length].def), isTrue: false, explanation: S.termIs(t.term, t.def) },
      ),
    };
  }

  private cards(ctx: LessonContext, topic: Topic, S: Strings): CardsContent {
    const cards: CardsContent["cards"] = topic.terms.map((t, i) => ({
      front: t.term,
      back: S.termIs(t.term, t.def),
      emoji: i === 0 && topic.plants ? "🌱" : null,
      tag: i === 0 ? ("concept" as const) : i % 3 === 0 ? ("fact" as const) : ("vocabulary" as const),
      concept: t.term,
      objectiveCode: this.code(ctx, i),
    }));
    cards.push({ front: S.why, back: S.whyBack(topic.plants, topic.title), emoji: null, tag: "concept", concept: topic.terms[0].term, objectiveCode: this.code(ctx, 0) });
    return { cards };
  }
}

export const PLANT_TITLE_EN = "Photosynthesis: how plants make food";
export const PLANT_TITLE_AR = "التمثيل الضوئي: كيف تصنع النباتات غذاءها";
