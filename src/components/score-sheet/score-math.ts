// Live, per-row preview maths for the score sheet. The authoritative results
// (positions, class averages) are computed on the server by the Results
// computation feature; this only tells the teacher what they just typed.

export type ScoreColumn = {
  key: string;
  /** Short name shown in the header, e.g. "CA 1". */
  label: string;
  max: number;
};

export type GradeBand = {
  grade: string;
  /** Lowest total that earns this grade, inclusive. */
  min: number;
  remark: string;
};

export type CellState =
  | { kind: "empty" }
  | { kind: "ok"; value: number }
  | { kind: "over"; value: number; max: number }
  /** Pasted text that is not a score; kept as typed so the teacher sees it (spec 0009, AC-10). */
  | { kind: "bad"; text: string };

export type RowState =
  | { kind: "empty" }
  | { kind: "partial"; missing: ScoreColumn[] }
  | { kind: "invalid" }
  | { kind: "complete"; total: number; band: GradeBand | undefined };

/** Up to three digits and one optional decimal place (half marks happen). */
export const SCORE_PATTERN = /^\d{0,3}(\.\d?)?$/;

export function readCell(raw: string | undefined, column: ScoreColumn): CellState {
  const text = (raw ?? "").trim();
  if (text === "" || text === ".") return { kind: "empty" };
  if (!SCORE_PATTERN.test(text)) return { kind: "bad", text };
  const value = Number(text);
  if (value > column.max) return { kind: "over", value, max: column.max };
  return { kind: "ok", value };
}

export function readRow(
  row: Record<string, string> | undefined,
  columns: ScoreColumn[],
  scale: GradeBand[],
): RowState {
  const cells = columns.map((column) => readCell(row?.[column.key], column));
  if (cells.some((cell) => cell.kind === "over" || cell.kind === "bad")) return { kind: "invalid" };
  if (cells.every((cell) => cell.kind === "empty")) return { kind: "empty" };

  const missing = columns.filter((_, i) => cells[i].kind === "empty");
  // A missing score is never counted as zero: the total waits until it is entered.
  if (missing.length > 0) return { kind: "partial", missing };

  const total = cells.reduce((sum, cell) => sum + (cell.kind === "ok" ? cell.value : 0), 0);
  const rounded = Math.round(total * 10) / 10;
  return { kind: "complete", total: rounded, band: gradeFor(rounded, scale) };
}

export function gradeFor(total: number, scale: GradeBand[]): GradeBand | undefined {
  return [...scale].sort((a, b) => b.min - a.min).find((band) => total >= band.min);
}

export function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** What a cell says when it needs fixing, in the teacher's words. Null when it is fine. */
export function cellProblem(cell: CellState, column: ScoreColumn): string | null {
  if (cell.kind === "over") return `${column.label} is out of ${column.max}. You wrote ${cell.value}.`;
  if (cell.kind === "bad") return `${column.label} must be a number like 15 or 12.5. You wrote ${cell.text}.`;
  return null;
}

/**
 * One pasted line, tidied (spec 0009, AC-10): carriage returns and spaces go,
 * and so do trailing zeros after the point ("48.00" is 48, "12.50" is 12.5).
 * Nothing else changes; a bad value stays as it is so it can be circled.
 */
export function tidyPasted(line: string): string {
  const text = line.replace(/\r/g, "").trim();
  if (!/^\d*\.\d*$/.test(text)) return text;
  return text.replace(/0+$/, "").replace(/\.$/, "");
}
