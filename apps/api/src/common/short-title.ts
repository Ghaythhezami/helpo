/**
 * A short provisional title from a rough teacher prompt. The title steers the very first generation steps, so it must
 * name the TOPIC: "Grade 11 Science, 45-minute lesson on cyber security measures" is "Cyber security measures", never
 * "Grade 11 Science" (that fragment once made Claude invent a chemistry lesson).
 *
 * Metadata clauses (grade, year, duration, subject, "Key concepts: ...") are skipped, and a clause that follows
 * "lesson on / about" or "Topic:" is preferred. The blueprint's title replaces the result after analysis.
 */

const SUBJECTS = "science|math(?:s|ematics)?|english|arabic|history|geography|physics|chemistry|biology|computing|ict|computer science|social studies|art|islamic studies|french";
const GRADE_META = new RegExp(String.raw`^(?:for\s+|a\s+)?(?:grade|year|form|class|level|stage|g)\s*\d{1,2}(?:st|nd|rd|th)?(?:\s+(?:students?|pupils?|learners?|class|${SUBJECTS}))?$`, "i");
const DURATION_META = /^(?:a\s+)?\d+(?:\.\d+)?[\s-]*(?:minutes?|mins?|hours?|hrs?)(?:[\s-]*(?:long|lesson|class|session))?$/i;
const BARE_META = new RegExp(String.raw`^(?:${SUBJECTS}|(?:a\s+)?(?:lesson|class|unit|session))$`, "i");
const META_KEYS = /^(subject|grade|year|duration|time|length|level|age|class|key\s+(?:concepts?|ideas?|terms?|words?)|concepts?|objectives?|goals?|notes?|activities|activity|include|including|focus|standards?|curriculum|students?)$/i;
const TOPIC_KEYS = /^(topic|title|lesson|unit|theme|about|subject\s+matter)$/i;
const LEAD_IN = /^(?:(?:a|an)\s+)?(?:\d+(?:\.\d+)?[\s-]*(?:minutes?|mins?|hours?|hrs?)[\s-]*)?(?:long\s+)?(?:lesson|class|unit|session)\s+(?:on|about|for|covering)\s*:?\s*/i;
const GRADE_PREFIX = /^(?:for\s+)?(?:grade|year|form)\s*\d{1,2}(?:st|nd|rd|th)?\s*(?:students?|pupils?|learners?|class)?\s*[:-]?\s*/i;

const isMeta = (clause: string): boolean => GRADE_META.test(clause) || DURATION_META.test(clause) || BARE_META.test(clause);

interface Candidate {
  text: string;
  explicit: boolean; // follows "lesson on / about" or "Topic:"
}

function candidateOf(raw: string): Candidate | null {
  let clause = raw.trim();
  if (!clause) return null;
  let explicit = false;
  const lead = clause.match(LEAD_IN) ?? clause.match(/^(?:on|about)\s+/i);
  if (lead) {
    clause = clause.slice(lead[0].length).trim();
    explicit = true;
  }
  // "Key: value" with a short key, found with indexOf rather than a backtracking regex.
  const colon = clause.indexOf(":");
  if (colon > 0 && colon <= 30) {
    const key = clause.slice(0, colon);
    const value = clause.slice(colon + 1);
    if (META_KEYS.test(key.trim())) return null;
    if (TOPIC_KEYS.test(key.trim()) || isMeta(key.trim())) {
      explicit = TOPIC_KEYS.test(key.trim());
      clause = value.trim();
    } else {
      clause = key.trim(); // "Cyber safety: how to stay safe" -> the part before the colon
    }
  }
  if (!clause) return null;
  if (isMeta(clause)) return null;
  const noGrade = clause.replace(GRADE_PREFIX, "").trim();
  if (noGrade && !isMeta(noGrade)) clause = noGrade;
  if (!clause || isMeta(clause)) return null;
  return { text: clause, explicit };
}

export function shortTitle(prompt: string): string {
  const cleaned = prompt
    .replace(/\s+/g, " ")
    .replace(/^please\s+/i, "")
    .replace(/^(lesson\s+(brief|plan|outline)|brief|topic|subject|title)\s*:\s*/i, "")
    .replace(/^((teach|make|create|write|prepare|build)\s+(me\s+)?(a\s+)?)?(lesson|class|unit)\s+(on|about|for)\s*:?\s*/i, "")
    .replace(/^(teach|explain)\s+/i, "")
    .trim();
  const clauses = cleaned.split(/[.,;\n!?]|\s[-–—]\s/);
  const candidates = clauses.map(candidateOf).filter((c): c is Candidate => c !== null);
  const picked = candidates.find((c) => c.explicit) ?? candidates[0];
  const clause = picked?.text ?? (cleaned.split(/[.,;:\n!?]|\s[-–—]\s/)[0].trim() || cleaned);
  const text = clause.length > 60 ? cutAtWord(clause, 60) : clause;
  return text ? text[0].toUpperCase() + text.slice(1) : "New lesson";
}

/** The first `max` characters, cut back to the last whole word (no backtracking regex). */
function cutAtWord(text: string, max: number): string {
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return space > 0 ? cut.slice(0, space).trimEnd() : cut;
}
