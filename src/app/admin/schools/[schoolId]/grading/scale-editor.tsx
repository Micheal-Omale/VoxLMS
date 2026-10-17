"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { type Band, MAX_BANDS, MIN_BANDS, SCALE_PRESETS, scaleProblem } from "@/lib/grading-presets";

import { saveGradeScaleAction } from "../../curriculum-actions";

type Row = { grade: string; min: string; remark: string };

const toRows = (bands: Band[]): Row[] => [...bands].sort((a, b) => b.min - a.min).map((b) => ({ grade: b.grade, min: String(b.min), remark: b.remark }));

/**
 * One section's grade scale for a session (spec 0006, AC-6). Grades are worked
 * out from the scale whenever they are shown, so saving changes them at once.
 */
export function ScaleEditor({
  schoolId,
  sectionId,
  sessionId,
  sectionName,
  sessionName,
  saved,
  starter,
}: {
  schoolId: string;
  sectionId: string;
  sessionId: string;
  sectionName: string;
  sessionName: string;
  saved: Band[];
  /** The usual scale for this stage, shown (not saved) while nothing is set. */
  starter: Band[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<Row[]>(toRows(saved.length > 0 ? saved : starter));
  const [serverError, setServerError] = useState<string | null>(null);
  const bands = rows.map((r) => ({ grade: r.grade, min: r.min.trim() === "" ? NaN : Number(r.min), remark: r.remark }));
  const problem = scaleProblem(bands);
  const dirty = JSON.stringify(rows) !== JSON.stringify(toRows(saved));

  // The top of each band: the next higher band's lowest score minus one, or 100.
  const mins = bands.map((b) => b.min).filter(Number.isFinite);
  const topOf = (min: number) => {
    if (!Number.isFinite(min)) return null;
    const above = mins.filter((m) => m > min);
    return above.length === 0 ? 100 : Math.min(...above) - 1;
  };
  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  function save() {
    start(async () => {
      const result = await saveGradeScaleAction(schoolId, sectionId, sessionId, bands);
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      setServerError(null);
      toast.add({ title: `${sectionName} grades saved`, description: `Every ${sectionName} grade in ${sessionName} now follows this scale.`, type: "success" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="type-caption font-semibold text-muted-foreground" id={`${sectionId}-scales`}>
          Start from
        </span>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${sectionId}-scales`}>
          {SCALE_PRESETS.map((p) => (
            <Button key={p.id} variant="outline" size="sm" onClick={() => setRows(toRows(p.bands))}>
              {p.name}
            </Button>
          ))}
        </div>
      </div>

      <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-lg border border-rule">
        <caption className="sr-only">
          {sectionName} grade scale for {sessionName}
        </caption>
        <thead>
          <tr className="bg-muted text-left">
            <th scope="col" className="w-20 px-3 py-2 type-caption font-semibold">
              Grade
            </th>
            <th scope="col" className="px-3 py-2 type-caption font-semibold">
              Scores
            </th>
            <th scope="col" className="px-3 py-2 type-caption font-semibold">
              Remark
            </th>
            <th scope="col" className="w-12 px-1 py-2">
              <span className="sr-only">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const invalid = problem?.index === i;
            const top = topOf(bands[i].min);
            return (
              <tr key={i}>
                <td className="border-t border-rule px-2 py-2 align-top">
                  <Input
                    aria-label={`Grade ${i + 1}`}
                    value={row.grade}
                    maxLength={4}
                    className="type-figure font-bold"
                    aria-invalid={invalid || undefined}
                    onChange={(e) => update(i, { grade: e.target.value.toUpperCase() })}
                  />
                </td>
                <td className="border-t border-rule px-2 py-2 align-top">
                  <span className="flex items-center gap-2">
                    <Input
                      aria-label={`${row.grade || `Grade ${i + 1}`} starts at`}
                      value={row.min}
                      inputMode="numeric"
                      maxLength={3}
                      className="w-16 type-figure text-right"
                      aria-invalid={invalid || undefined}
                      onChange={(e) => update(i, { min: e.target.value.replace(/[^0-9]/g, "") })}
                    />
                    <span className="type-figure whitespace-nowrap text-muted-foreground">to {top ?? "?"}</span>
                  </span>
                </td>
                <td className="border-t border-rule px-2 py-2 align-top">
                  <Input
                    aria-label={`Remark for ${row.grade || `grade ${i + 1}`}`}
                    value={row.remark}
                    maxLength={30}
                    aria-invalid={invalid || undefined}
                    onChange={(e) => update(i, { remark: e.target.value })}
                  />
                </td>
                <td className="border-t border-rule px-1 py-2 align-top">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove grade ${row.grade || i + 1}`}
                    disabled={rows.length <= MIN_BANDS}
                    onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
                  >
                    <XIcon />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="flex flex-col gap-3">
        {rows.length < MAX_BANDS && (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setRows((r) => [...r, { grade: "", min: "", remark: "" }])}>
            <PlusIcon data-icon="inline-start" />
            Add a grade
          </Button>
        )}
        {problem && (
          <p className="type-caption font-semibold text-warning" aria-live="polite">
            {problem.error}
          </p>
        )}
        {serverError && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive-wash p-3 text-destructive">
            {serverError}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {saved.length === 0 && <span className="flex-1 type-caption text-warning">Not saved yet</span>}
          {dirty && saved.length > 0 && (
            <Button
              variant="ghost"
              onClick={() => {
                setRows(toRows(saved));
                setServerError(null);
              }}
            >
              Undo changes
            </Button>
          )}
          <Button onClick={save} disabled={pending || problem !== null || (!dirty && saved.length > 0)}>
            {pending && <Spinner data-icon="inline-start" />}
            Save grades
          </Button>
        </div>
      </div>
    </div>
  );
}
