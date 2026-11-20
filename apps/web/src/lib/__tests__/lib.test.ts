import type { CheckView, LessonDetail } from "@helpo/shared";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import { bandAttr, bandSentence, bandUi, bandUiForGrade } from "../band";
import { nextOpenCheck, openChecks, openChecksByResource } from "../checks";
import { moveInArray, replaceTextInContent, toLines } from "../content-edit";
import { initials, parseNames, pct } from "../format";
import { applyLocale, localeDir, localeFromCookie } from "../locale";
import { translate } from "../messages";
import { anyTranslationWorking, isFallback, shouldAutoTranslate, translationPhase, translationProgress } from "../translation";
import { drawStrokes, loadStrokes, saveStrokes, undoStroke, type Stroke } from "../whiteboard";
import { pipelineSteps } from "@/components/teacher/making";
import { formatSize, titleFromFile, validateFile } from "@/lib/upload";
import { exportHref } from "@/components/teacher/lesson-actions";
import { resolvePath } from "@/components/student/join-flow";
import { readLastResult, saveLastResult, tileArt } from "../student-helpers";

describe("band helpers", () => {
  it("derives the band, targets and mascot rules from the grade", () => {
    expect(bandUiForGrade(3)).toMatchObject({ band: "EXPLORER", minTarget: 64, readAloud: true, pictureTiles: true, timers: false });
    expect(bandUiForGrade(7)).toMatchObject({ band: "NAVIGATOR", minTarget: 44, readAloud: false, mascot: true });
    expect(bandUi("STUDIO")).toMatchObject({ mascot: false, timers: true });
    expect(bandAttr("STUDIO")).toBe("studio");
    expect(bandSentence(6)).toBe("Grade 6 sets the Navigator band automatically.");
  });
});

describe("messages", () => {
  it("has the same keys in English and Arabic", () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  });
  it("fills placeholders and falls back to the key", () => {
    expect(translate("en", "join.in", { name: "Sara A." })).toBe("You're in, Sara A.!");
    expect(translate("ar", "join.in", { name: "سارة" })).toContain("سارة");
    expect(translate("en", "no.such.key")).toBe("no.such.key");
  });
  it("keeps every Arabic placeholder from the English text", () => {
    for (const [key, text] of Object.entries(en)) {
      const vars = (text.match(/\{\w+\}/g) ?? []).sort();
      const arVars = ((ar as Record<string, string>)[key].match(/\{\w+\}/g) ?? []).sort();
      expect({ key, vars: arVars }).toEqual({ key, vars });
    }
  });
});

describe("locale", () => {
  it("applyLocale sets the cookie, lang and dir", () => {
    applyLocale("ar");
    expect(document.cookie).toContain("helpo_locale=ar");
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    applyLocale("en");
    expect(document.documentElement.dir).toBe("ltr");
  });
  it("reads the cookie header", () => {
    expect(localeFromCookie("a=1; helpo_locale=ar")).toBe("ar");
    expect(localeFromCookie("helpo_locale=fr")).toBe("en");
    expect(localeFromCookie(null)).toBe("en");
    expect(localeDir("ar")).toBe("rtl");
  });
});

const check = (id: string, resource: CheckView["resource"], status: CheckView["status"]): CheckView => ({ id, resource, itemRef: "Q1", kind: "FACT_CHECK", message: "m", suggestion: null, sourcePage: null, status });

describe("checks", () => {
  const list = [check("a", "QUIZ", "OPEN"), check("b", "SLIDES", "ACCEPTED"), check("c", "QUIZ", "OPEN")];
  it("counts open checks per resource and walks to the next open one", () => {
    expect(openChecks(list)).toHaveLength(2);
    expect(openChecksByResource(list)).toMatchObject({ QUIZ: 2, SLIDES: 0 });
    expect(nextOpenCheck(list, "a")?.id).toBe("c");
    expect(nextOpenCheck(list, "c")?.id).toBe("a");
    expect(nextOpenCheck([check("x", "QUIZ", "DISMISSED")])).toBeNull();
  });
});

describe("translation state machine", () => {
  const lesson = (en: string, ar: string) => ({ translations: { en, ar } }) as Pick<LessonDetail, "translations">;
  it("moves missing to working to ready", () => {
    expect(translationPhase(lesson("ready", "missing"), "ar")).toBe("missing");
    expect(translationPhase(lesson("ready", "missing"), "ar", true)).toBe("failed");
    expect(translationPhase(lesson("ready", "working"), "ar")).toBe("working");
    expect(translationPhase(lesson("ready", "ready"), "ar")).toBe("ready");
  });
  it("auto-translates once per lesson and language", () => {
    expect(shouldAutoTranslate(lesson("ready", "missing"), "ar", false)).toBe(true);
    expect(shouldAutoTranslate(lesson("ready", "missing"), "ar", true)).toBe(false);
    expect(shouldAutoTranslate(lesson("ready", "ready"), "ar", false)).toBe(false);
    expect(anyTranslationWorking(lesson("ready", "working"))).toBe(true);
  });
  it("shows progress from the resources in the viewer's language", () => {
    const l = { translations: { en: "ready", ar: "working" }, contentLocale: "en", resources: [{ status: "READY", contentLocale: "ar" }, { status: "READY", contentLocale: "en" }] } as unknown as LessonDetail;
    expect(translationProgress(l, "ar")).toBe(0.5);
    expect(isFallback("en", "ar")).toBe(true);
    expect(isFallback("ar", "ar")).toBe(false);
  });
});

describe("content editing", () => {
  it("replaces the first matching string and reports whether it changed", () => {
    const out = replaceTextInContent({ a: ["x one", "x two"] }, "x", "y");
    expect(out.content).toEqual({ a: ["y one", "x two"] });
    expect(out.changed).toBe(true);
    expect(replaceTextInContent({ a: "b" }, "zzz", "y").changed).toBe(false);
  });
  it("moves items and splits lines", () => {
    expect(moveInArray([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveInArray([1, 2], 0, 5)).toEqual([1, 2]);
    expect(toLines("a\n\n b ")).toEqual(["a", "b"]);
  });
});

describe("format helpers", () => {
  it("formats and parses", () => {
    expect(pct(0.743)).toBe("74%");
    expect(pct(null)).toBe("–");
    expect(initials("Sara Ahmed")).toBe("SA");
    expect(parseNames("Sara A\nomar k, sara a;  Mia")).toEqual(["Sara A", "omar k", "Mia"]);
  });
});

describe("whiteboard", () => {
  const stroke = (n: number): Stroke => ({ tool: "pencil", color: "#000", size: 3, points: Array.from({ length: n }, (_, i) => ({ x: i / 10, y: 0.5, p: 0.5 })) });
  it("undoes the last stroke and persists per lesson", () => {
    expect(undoStroke([stroke(2), stroke(3)])).toHaveLength(1);
    saveStrokes("l1", [stroke(3)]);
    expect(loadStrokes("l1")).toHaveLength(1);
    expect(loadStrokes("other")).toEqual([]);
  });
  it("redraws from normalised points at any size", () => {
    const calls: string[] = [];
    const ctx = { clearRect: () => calls.push("clear"), beginPath: () => undefined, moveTo: () => undefined, lineTo: () => calls.push("line"), stroke: () => undefined, arc: () => undefined, fill: () => undefined } as unknown as CanvasRenderingContext2D;
    drawStrokes(ctx, 800, 400, [stroke(3)]);
    expect(calls).toEqual(["clear", "line", "line"]);
  });
});

describe("create screen helpers", () => {
  it("validates file type and size (20 MB) and builds titles", () => {
    expect(validateFile(new File(["x"], "a.exe"))).toBe("type");
    expect(validateFile(new File(["x"], "a.pdf"))).toBeNull();
    expect(validateFile(new File([new ArrayBuffer(21 * 1024 * 1024)], "a.pdf"))).toBe("size");
    expect(titleFromFile("Plants_Unit-3.pdf")).toBe("Plants Unit 3");
    expect(formatSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });
  it("lists the honest pipeline steps from the lesson status", () => {
    expect(pipelineSteps("EXTRACTING", 0).map((s) => s.state)).toEqual(["done", "active", "todo", "todo"]);
    expect(pipelineSteps("ANALYZING", 900).map((s) => s.state)).toEqual(["done", "done", "active", "todo"]);
    expect(pipelineSteps("GENERATING", 900).map((s) => s.state)).toEqual(["done", "done", "done", "active"]);
    expect(pipelineSteps("PARTIAL", 900).every((s) => s.state === "done")).toBe(true);
  });
  it("builds export links", () => {
    expect(exportHref("r1", "pdf", true)).toBe("/api/resources/r1/export?format=pdf&key=true");
    expect(exportHref("r1", "pptx")).toBe("/api/resources/r1/export?format=pptx");
  });
});

describe("student helpers", () => {
  it("picks tile art and stores the last result", () => {
    expect(tileArt("Roots")).toBe("tile-roots");
    expect(tileArt("Something else")).toBeNull();
    const store: Record<string, string> = {};
    const storage = { setItem: (k: string, v: string) => (store[k] = v), getItem: (k: string) => store[k] ?? null };
    saveLastResult({ game: "MATCH", lessonId: "l1", result: { stars: 3, xp: 60, personalBest: true, totalXp: 1, level: 1, xpIntoLevel: 1, badgeUnlocked: null, classGoal: { goalXp: 1, earnedXp: 1 } } }, storage);
    expect(readLastResult(storage)?.result.stars).toBe(3);
  });
  it("routes a joined student to the quiz, or to nothing when idle", async () => {
    await expect(resolvePath({ participantId: "p", displayName: "S", sessionId: "se1", next: "quiz" })).resolves.toBe("/play/quiz/se1");
    await expect(resolvePath({ participantId: "p", displayName: "S", sessionId: null, next: "home" })).resolves.toBeNull();
  });
});
