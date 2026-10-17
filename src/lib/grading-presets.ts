// Score splits and grade scales our team starts from (spec 0006, AC-5, AC-6),
// and the rules a split or scale must meet. Shared by the server and the forms.

export type Stage = "primary" | "junior_secondary" | "senior_secondary";
export type SplitPart = { label: string; max: number };
export type Band = { grade: string; min: number; remark: string };

export const SPLIT_PRESETS: { id: string; name: string; parts: SplitPart[] }[] = [
  { id: "ca20-ca20-exam60", name: "CA 1 20, CA 2 20, Exam 60", parts: [{ label: "CA 1", max: 20 }, { label: "CA 2", max: 20 }, { label: "Exam", max: 60 }] },
  { id: "ca40-exam60", name: "CA 40, Exam 60", parts: [{ label: "CA", max: 40 }, { label: "Exam", max: 60 }] },
  {
    id: "ca10x3-exam70",
    name: "CA 1 10, CA 2 10, CA 3 10, Exam 70",
    parts: [{ label: "CA 1", max: 10 }, { label: "CA 2", max: 10 }, { label: "CA 3", max: 10 }, { label: "Exam", max: 70 }],
  },
  { id: "ca30-exam70", name: "CA 30, Exam 70", parts: [{ label: "CA", max: 30 }, { label: "Exam", max: 70 }] },
];

export const SCALE_PRESETS: { id: string; name: string; bands: Band[] }[] = [
  {
    id: "a-to-f",
    name: "A to F",
    bands: [
      { grade: "A", min: 70, remark: "Excellent" },
      { grade: "B", min: 60, remark: "Very good" },
      { grade: "C", min: 50, remark: "Good" },
      { grade: "D", min: 45, remark: "Fair" },
      { grade: "E", min: 40, remark: "Pass" },
      { grade: "F", min: 0, remark: "Fail" },
    ],
  },
  {
    id: "waec",
    name: "WAEC A1 to F9",
    bands: [
      { grade: "A1", min: 75, remark: "Excellent" },
      { grade: "B2", min: 70, remark: "Very good" },
      { grade: "B3", min: 65, remark: "Good" },
      { grade: "C4", min: 60, remark: "Credit" },
      { grade: "C5", min: 55, remark: "Credit" },
      { grade: "C6", min: 50, remark: "Credit" },
      { grade: "D7", min: 45, remark: "Pass" },
      { grade: "E8", min: 40, remark: "Pass" },
      { grade: "F9", min: 0, remark: "Fail" },
    ],
  },
];

/** Primary starts on CA 40 / Exam 60; secondary on CA 1 20 / CA 2 20 / Exam 60. */
export function defaultSplit(stage: Stage) {
  return SPLIT_PRESETS.find((p) => p.id === (stage === "primary" ? "ca40-exam60" : "ca20-ca20-exam60"))!;
}

/** Senior Secondary uses the WAEC scale; Primary and Junior Secondary use A to F. */
export function defaultScale(stage: Stage) {
  return SCALE_PRESETS.find((p) => p.id === (stage === "senior_secondary" ? "waec" : "a-to-f"))!;
}

export const MAX_PARTS = 5;
export const MIN_BANDS = 2;
export const MAX_BANDS = 12;

const whole = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;

/** What's wrong with a score split, in plain words; null if it can be saved. */
export function splitProblem(parts: SplitPart[]): { index: number | null; error: string } | null {
  if (parts.length === 0) return { index: null, error: "A score split needs at least one part." };
  if (parts.length > MAX_PARTS) return { index: null, error: `A score split has at most ${MAX_PARTS} parts.` };
  const seen = new Set<string>();
  for (const [i, p] of parts.entries()) {
    const label = p.label.trim();
    if (!label) return { index: i, error: `Part ${i + 1} needs a name, like CA 1.` };
    if (label.length > 20) return { index: i, error: `“${label}” is too long. Keep part names to 20 characters.` };
    if (seen.has(label.toLowerCase())) return { index: i, error: `Two parts are called “${label}”. Give each part its own name.` };
    seen.add(label.toLowerCase());
    if (!whole(p.max, 1, 100)) return { index: i, error: `${label} must be out of a whole number from 1 to 100.` };
  }
  const total = parts.reduce((sum, p) => sum + p.max, 0);
  if (total !== 100) return { index: null, error: `The parts add up to ${total}. They must add up to exactly 100.` };
  return null;
}

/** What's wrong with a grade scale, in plain words; null if it can be saved. */
export function scaleProblem(bands: Band[]): { index: number | null; error: string } | null {
  if (bands.length < MIN_BANDS) return { index: null, error: `A grade scale needs at least ${MIN_BANDS} grades.` };
  if (bands.length > MAX_BANDS) return { index: null, error: `A grade scale has at most ${MAX_BANDS} grades.` };
  const grades = new Set<string>();
  const mins = new Set<number>();
  for (const [i, b] of bands.entries()) {
    const grade = b.grade.trim();
    if (!grade) return { index: i, error: `Row ${i + 1} needs a grade, like A or B2.` };
    if (grade.length > 4) return { index: i, error: `“${grade}” is too long for a grade. Use up to 4 characters.` };
    if (grades.has(grade.toLowerCase())) return { index: i, error: `Grade ${grade} appears twice.` };
    grades.add(grade.toLowerCase());
    if (!whole(b.min, 0, 100)) return { index: i, error: `Grade ${grade} must start at a whole number from 0 to 100.` };
    if (mins.has(b.min)) return { index: i, error: `Two grades start at ${b.min}. Each grade needs its own lowest score.` };
    mins.add(b.min);
    if (!b.remark.trim()) return { index: i, error: `Grade ${grade} needs a remark, like Credit.` };
    if (b.remark.trim().length > 30) return { index: i, error: `The remark for ${grade} is too long. Keep it to 30 characters.` };
  }
  if (!mins.has(0)) return { index: null, error: "The lowest grade must start at 0, so every score gets a grade." };
  return null;
}

/** The highest score in each band: the next band's lowest score minus one, or 100. */
export function bandTops(bands: Band[]) {
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return new Map(sorted.map((b, i) => [b, i === 0 ? 100 : sorted[i - 1].min - 1]));
}

/** "CA 1" → "ca1", "Exam" → "exam"; a number is added if the key is already used. */
export function partKey(label: string, taken: Iterable<string>) {
  const used = new Set(taken);
  const base = label.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16) || "part";
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}_${n}`)) return `${base}_${n}`;
}
