import type { BadgeKey, GameKind, GameResultView } from "@helpo/shared";

export const BADGE_ART: Record<BadgeKey, string> = {
  PLANT_SCOUT: "badge-top-class",
  WORD_WIZARD: "badge-word-wizard",
  KIND_HELPER: "badge-kind-helper",
  NEVER_GIVES_UP: "badge-never-gives-up",
  WATER_WISE: "badge-water-wise",
};

/** Picks an illustration for a tile from its text (plant parts, needs, equation words). Null means no picture. */
export function tileArt(label: string): string | null {
  const l = label.toLowerCase();
  const rules: [RegExp, string][] = [
    [/root/, "tile-roots"],
    [/leaf|leaves|chlorophyll/, "tile-leaf"],
    [/stem|trunk/, "tile-stem"],
    [/flower|seed|fruit/, "tile-flower"],
    [/carbon dioxide|co2|co₂/, "tile-co2"],
    [/water|drop|rain/, "drop"],
    [/candy|chocolate|sugar|pizza/, "tile-candy"],
    [/dark/, "tile-darkness"],
    [/plastic/, "tile-plastic"],
    [/mineral|soil/, "tile-minerals"],
    [/light|sun/, "lightbulb"],
  ];
  return rules.find(([re]) => re.test(l))?.[1] ?? null;
}

export const AVATAR_UNLOCK_LEVEL: Record<string, number> = { scarf: 5, hat: 7, glasses: 9, backpack: 10, sky: 9 };
export const AVATAR_BACKGROUNDS: Record<string, string> = { lavender: "#E9DEFF", meadow: "#D4FBDC", sky: "#C7E2FD" };
export const AVATAR_ITEMS = ["scarf", "hat", "glasses", "backpack"] as const;

export const STOP_POSITIONS: [number, number][] = [
  [11.46, 59.52],
  [28.13, 40.48],
  [44.79, 59.52],
  [61.46, 40.48],
  [78.13, 59.52],
  [90.63, 40.48],
];

export interface StoredResult {
  game: GameKind;
  lessonId: string;
  result: GameResultView;
}

const KEY = "helpo:last-result";

export function saveLastResult(value: StoredResult, storage: Pick<Storage, "setItem"> = window.sessionStorage): void {
  storage.setItem(KEY, JSON.stringify(value));
}

export function readLastResult(storage: Pick<Storage, "getItem"> = window.sessionStorage): StoredResult | null {
  try {
    const raw = storage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredResult) : null;
  } catch {
    return null;
  }
}

/** Reads text aloud with the Web Speech API (Explorer band). Returns false when unsupported. */
export function speak(text: string, lang: string): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "ar" ? "ar-SA" : "en-US";
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

/** Short sound cue. Sound is off by default; callers pass the user's choice. */
export function beep(enabled: boolean, frequency: number): void {
  if (!enabled || typeof window === "undefined") return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = frequency;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    setTimeout(() => void ctx.close(), 400);
  } catch {
    /* sound is optional */
  }
}
