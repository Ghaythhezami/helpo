import { BAND_LABELS, bandForGrade, type Band } from "@helpo/shared";
import type { TFunction } from "./messages";

export interface BandUi {
  band: Band;
  label: string;
  /** Minimum touch target in px (Helpo uses 44, and 64 for Explorer). */
  minTarget: number;
  /** Read-aloud buttons (Web Speech API). */
  readAloud: boolean;
  /** Picture tiles. */
  pictureTiles: boolean;
  /** Studio is calm: no mascot, small XP line. */
  mascot: boolean;
  /** Optional count-up timer in games (Studio only, never Explorer). */
  timers: boolean;
  summary: string;
}

const UI: Record<Band, Omit<BandUi, "band" | "label">> = {
  EXPLORER: {
    minTarget: 64,
    readAloud: true,
    pictureTiles: true,
    mascot: true,
    timers: false,
    summary: "Big picture tiles, read-aloud on every tile, no timers.",
  },
  NAVIGATOR: {
    minTarget: 44,
    readAloud: false,
    pictureTiles: false,
    mascot: true,
    timers: false,
    summary: "Journey map, badges and daily quests.",
  },
  STUDIO: {
    minTarget: 44,
    readAloud: false,
    pictureTiles: false,
    mascot: false,
    timers: true,
    summary: "Small XP line, no mascot, calm layout.",
  },
};

export function bandUi(band: Band): BandUi {
  return { band, label: BAND_LABELS[band], ...UI[band] };
}

export function bandUiForGrade(grade: number): BandUi {
  return bandUi(bandForGrade(grade));
}

/** Short sentence under the class picker: "Grade 6 sets the Navigator band automatically." */
export function bandSentence(grade: number, t?: TFunction): string {
  const band = bandForGrade(grade);
  if (t) return t("band.sentence", { grade, band: t(`band.${band}` as "band.EXPLORER") });
  return `Grade ${grade} sets the ${BAND_LABELS[band]} band automatically.`;
}

export const BANDS_IN_ORDER: Band[] = ["EXPLORER", "NAVIGATOR", "STUDIO"];

export const BAND_GRADES: Record<Band, string> = {
  EXPLORER: "Grades 2 to 5",
  NAVIGATOR: "Grades 6 to 8",
  STUDIO: "Grades 9 to 12",
};

/** data-band attribute value used by the student stylesheet. */
export function bandAttr(band: Band): "explorer" | "navigator" | "studio" {
  return band.toLowerCase() as "explorer" | "navigator" | "studio";
}
