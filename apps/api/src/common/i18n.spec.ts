import { pickLocalized } from "@helpo/shared";
import { initialTranslations, localeOf, parseTranslations, pickJson, pickText, writeCol } from "./i18n";
import { lessonTitle, objectivesOf, toCheckView, toResourceView } from "./views";

const req = (headers: Record<string, string | string[]>) => ({ headers }) as never;

describe("locale resolution", () => {
  it("prefers the x-helpo-locale header", () => {
    expect(localeOf(req({ "x-helpo-locale": "ar", cookie: "helpo_locale=en" }))).toBe("ar");
    expect(localeOf(req({ "x-helpo-locale": ["ar-TN", "en"] }))).toBe("ar");
  });
  it("falls back to the helpo_locale cookie, then en", () => {
    expect(localeOf(req({ cookie: "x=1; helpo_locale=ar" }))).toBe("ar");
    expect(localeOf(req({}))).toBe("en");
    expect(localeOf(req({ "x-helpo-locale": "fr" }))).toBe("en");
    expect(localeOf(req({ cookie: "helpo_locale=zz" }))).toBe("en");
  });
});

describe("pickLocalized fallback", () => {
  it("returns the requested language when present", () => {
    expect(pickLocalized({ en: "Hello", ar: "مرحبا" }, "ar")).toMatchObject({ value: "مرحبا", locale: "ar", fallback: false });
  });
  it("falls back to the other language when the requested one is missing or empty", () => {
    expect(pickLocalized({ en: "Hello", ar: null }, "ar")).toMatchObject({ value: "Hello", locale: "en", fallback: true });
    expect(pickLocalized({ en: "", ar: "مرحبا" }, "en")).toMatchObject({ value: "مرحبا", locale: "ar", fallback: true });
  });
  it("returns null when neither exists", () => {
    expect(pickLocalized({ en: null, ar: undefined }, "en")).toMatchObject({ value: null, locale: null });
  });
  it("pickText/pickJson apply the same rules (empty arrays count as missing)", () => {
    expect(pickText("a", null, "ar")).toBe("a");
    expect(pickJson<number[]>([1], [], "ar")).toEqual({ value: [1], locale: "en" });
    expect(pickJson<number[]>([], [], "en").value).toBeNull();
  });
});

describe("translation state helpers", () => {
  it("parses stored status with sensible defaults", () => {
    expect(parseTranslations({ en: "ready", ar: "working" })).toEqual({ en: "ready", ar: "working" });
    expect(parseTranslations(null, "ar")).toEqual({ en: "missing", ar: "ready" });
    expect(parseTranslations({ en: "bogus" }, "en")).toEqual({ en: "ready", ar: "missing" });
    expect(initialTranslations("ar")).toEqual({ en: "missing", ar: "ready" });
  });
  it("writeCol targets the right column", () => {
    expect(writeCol("title", "ar", "x")).toEqual({ titleAr: "x" });
    expect(writeCol("content", "en", 1)).toEqual({ contentEn: 1 });
  });
});

describe("localized views", () => {
  const now = new Date();
  it("returns the request locale with fallback and per-resource translation state", () => {
    const row = { id: "r", kind: "QUIZ", status: "READY", error: null, contentEn: { questions: [] }, contentAr: null, createdAt: now, updatedAt: now, lessonId: "l" } as never;
    const ar = toResourceView(row, "ar", { en: "ready", ar: "working" });
    expect(ar.contentLocale).toBe("en");
    expect(ar.translations).toEqual({ en: "ready", ar: "working" });
    expect(toResourceView(row, "en", { en: "ready", ar: "missing" }).translations.ar).toBe("missing");
  });
  it("localizes lesson titles, objectives and checks", () => {
    expect(lessonTitle({ titleEn: "Plants", titleAr: "نباتات" }, "ar")).toBe("نباتات");
    expect(lessonTitle({ titleEn: "Plants", titleAr: null }, "ar")).toBe("Plants");
    const objective = { code: "O1", text: "t", bloom: "remember", sourcePage: null };
    expect(objectivesOf({ objectivesEn: [objective], objectivesAr: [] }, "ar")).toHaveLength(1);
    const check = { id: "c", resource: "QUIZ", itemRef: "Q1", kind: "FACT_CHECK", messageEn: "m", messageAr: "ر", suggestionEn: "s", suggestionAr: null, sourcePage: 1, status: "OPEN" } as never;
    expect(toCheckView(check, "ar")).toMatchObject({ message: "ر", suggestion: "s" });
  });
});
