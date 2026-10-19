// Remarks (spec 0011): the teacher's and the head's comment for each student
// in a term. Pure: no database, no clock. The automatic head's comment is
// worked out here from the student's average in hundredths (spec 0010) and
// the school's bands, never through a JavaScript float.

/** A comment fits in this many characters after tidying (AC-3). */
export const REMARK_MAX = 200;
/** The counter shows from this many characters (AC-3). */
export const REMARK_COUNTER_FROM = 160;

export const MIN_REMARK_BANDS = 2;
export const MAX_REMARK_BANDS = 10;

/** One band of a school's head's comments: the lowest average as text ("70", "62.5") and its wording. */
export type RemarkBand = { minAverage: string; remark: string };

/** Every school starts with these (the migration, `createSchool` and the demo seed). */
export const DEFAULT_REMARK_BANDS: RemarkBand[] = [
  { minAverage: "70", remark: "An excellent result. Keep it up." },
  { minAverage: "60", remark: "A very good result. Keep working hard." },
  { minAverage: "50", remark: "A good result, with room to do even better." },
  { minAverage: "40", remark: "A fair result. More effort is needed next term." },
  { minAverage: "0", remark: "A weak result. Serious work is needed next term." },
];

/** Starter teacher's comments to tap in and edit, written without he or she (AC-3). */
export const QUICK_PICKS = [
  "A brilliant student. Keep it up.",
  "Hardworking and well behaved.",
  "A good term's work.",
  "Can do better with more effort.",
  "Needs to pay more attention in class.",
  "Shows steady improvement.",
  "Neat, punctual and respectful.",
  "A quiet student who should take part more.",
  "Needs to work harder in weak subjects.",
  "Should read more at home.",
] as const;

/** Ends trimmed, every run of spaces, tabs and line breaks folded into one space; empty is null. */
export function tidyRemark(text: string | null | undefined): string | null {
  const tidy = (text ?? "").trim().replace(/\s+/g, " ");
  return tidy === "" ? null : tidy;
}

/** Two comments are the same when their tidy text is. */
export const sameRemark = (a: string | null | undefined, b: string | null | undefined) => (tidyRemark(a) ?? "") === (tidyRemark(b) ?? "");

/** A tap on a quick pick: fills an empty box, or adds to the end after one space. Never replaces. */
export function addPick(text: string, pick: string): string {
  const current = text.trimEnd();
  return current.trim() === "" ? pick : `${current} ${pick}`;
}

/** Characters a comment will have once tidied, for the counter and the 200 limit. */
export const remarkLength = (text: string | null | undefined) => tidyRemark(text)?.length ?? 0;

const AVERAGE = /^(\d{1,3})(?:\.(\d{1,2}))?$/;

/** "62.5" → 6250, "70" → 7000. Null for anything that isn't 0 to 100 with up to 2 decimal places. */
export function toHundredths(text: string): number | null {
  const match = AVERAGE.exec(text.trim());
  if (!match) return null;
  const value = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return value <= 10000 ? value : null;
}

/** 6250 → "62.5", 7000 → "70": the shortest text for a lowest average. */
export function fromHundredths(value: number): string {
  const whole = Math.floor(value / 100);
  const part = value % 100;
  if (part === 0) return String(whole);
  return `${whole}.${String(part).padStart(2, "0").replace(/0$/, "")}`;
}

/** The head's comment as shown and printed (AC-4). */
export type HeadRemark = { kind: "typed"; text: string } | { kind: "automatic"; text: string } | { kind: "waiting" };

/**
 * The remark of the highest band whose lowest average is at or below the
 * student's average (hundredths). Undefined only with no band at 0.
 */
export function headRemarkFor(averageHundredths: number, bands: RemarkBand[]): string | undefined {
  let best: RemarkBand | undefined;
  let bestMin = -1;
  for (const band of bands) {
    const min = toHundredths(band.minAverage);
    if (min !== null && averageHundredths >= min && min > bestMin) {
      best = band;
      bestMin = min;
    }
  }
  return best?.remark;
}

/** A typed comment wins; else automatic from a complete average; else it waits for all scores. */
export function resolveHeadRemark(typed: string | null, averageHundredths: number | null, bands: RemarkBand[]): HeadRemark {
  const text = tidyRemark(typed);
  if (text) return { kind: "typed", text };
  if (averageHundredths === null) return { kind: "waiting" };
  const automatic = headRemarkFor(averageHundredths, bands);
  return automatic ? { kind: "automatic", text: automatic } : { kind: "waiting" };
}

/**
 * The first broken band rule (AC-10), naming the band by its row, or null.
 * Wording is checked after tidying; lowest averages as typed.
 */
export function remarkBandsProblem(bands: RemarkBand[]): { index: number | null; error: string } | null {
  if (bands.length < MIN_REMARK_BANDS) return { index: null, error: `Principal's comments need at least ${MIN_REMARK_BANDS} bands.` };
  if (bands.length > MAX_REMARK_BANDS) return { index: null, error: `Principal's comments have at most ${MAX_REMARK_BANDS} bands.` };
  const seen = new Map<number, number>();
  for (const [i, band] of bands.entries()) {
    const min = toHundredths(band.minAverage);
    if (min === null) return { index: i, error: `Band ${i + 1} must start at an average from 0 to 100, with up to 2 decimal places.` };
    const twin = seen.get(min);
    if (twin !== undefined) return { index: i, error: `Bands ${twin + 1} and ${i + 1} both start at ${fromHundredths(min)}. Each band needs its own lowest average.` };
    seen.set(min, i);
    const remark = tidyRemark(band.remark);
    if (!remark) return { index: i, error: `Band ${i + 1} needs its wording.` };
    if (remark.length > REMARK_MAX) return { index: i, error: `The wording for band ${i + 1} is ${remark.length} characters. Keep it to ${REMARK_MAX}.` };
  }
  if (!seen.has(0)) return { index: null, error: "One band must start at 0, so every student with all scores gets a comment." };
  return null;
}
