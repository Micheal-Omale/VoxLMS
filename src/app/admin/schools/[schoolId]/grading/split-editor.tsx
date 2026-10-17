"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheckIcon, PlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { MAX_PARTS, SPLIT_PRESETS, type SplitPart, splitProblem } from "@/lib/grading-presets";

import { saveScoreSplitAction } from "../../curriculum-actions";

type SavedPart = { id: string; key: string; label: string; max: number; scores: number };
type Row = { id: string | null; label: string; max: string; scores: number };

const toRows = (parts: SavedPart[]): Row[] => parts.map((p) => ({ id: p.id, label: p.label, max: String(p.max), scores: p.scores }));

/**
 * Lays a preset over the saved parts: a saved part with the same name keeps
 * its place (and its scores), then the rest are reused in order, so choosing
 * a preset renames parts rather than throwing scored ones away.
 */
function applyPreset(preset: SplitPart[], saved: SavedPart[]): Row[] {
  const free = [...saved];
  const take = (label: string) => {
    const i = free.findIndex((p) => p.label.toLowerCase() === label.toLowerCase());
    return i === -1 ? null : free.splice(i, 1)[0];
  };
  const matched = preset.map((p) => take(p.label));
  return preset.map((p, i) => {
    const part = matched[i] ?? free.shift() ?? null;
    return { id: part?.id ?? null, label: p.label, max: String(p.max), scores: part?.scores ?? 0 };
  });
}

/** One section's score split for a session (spec 0006, AC-5, AC-7). */
export function SplitEditor({
  schoolId,
  sectionId,
  sessionId,
  sectionName,
  saved,
  starter,
}: {
  schoolId: string;
  sectionId: string;
  sessionId: string;
  sectionName: string;
  saved: SavedPart[];
  /** The usual split for this stage, shown (not saved) while nothing is set. */
  starter: SplitPart[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<Row[]>(saved.length > 0 ? toRows(saved) : applyPreset(starter, []));
  const [serverError, setServerError] = useState<string | null>(null);
  const parts = rows.map((r) => ({ label: r.label, max: r.max.trim() === "" ? NaN : Number(r.max) }));
  const problem = splitProblem(parts);
  const total = parts.reduce((sum, p) => sum + (Number.isFinite(p.max) ? p.max : 0), 0);
  const dirty = JSON.stringify(rows.map(({ id, label, max }) => [id, label, max])) !== JSON.stringify(toRows(saved).map(({ id, label, max }) => [id, label, max]));
  const id = (what: string, i: number) => `${sectionId}-${what}-${i}`;

  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  function save() {
    start(async () => {
      const result = await saveScoreSplitAction(
        schoolId,
        sectionId,
        sessionId,
        rows.map((r) => ({ id: r.id, label: r.label, max: Number(r.max) })),
      );
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      setServerError(null);
      toast.add({ title: `${sectionName} score split saved`, type: "success" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="type-caption font-semibold text-muted-foreground" id={`${sectionId}-presets`}>
          Start from
        </span>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${sectionId}-presets`}>
          {SPLIT_PRESETS.map((p) => (
            <Button key={p.id} variant="outline" size="sm" onClick={() => setRows(applyPreset(p.parts, saved))}>
              <span className="type-figure">{p.name}</span>
            </Button>
          ))}
        </div>
      </div>

      <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-lg border border-rule">
        <caption className="sr-only">Parts of the {sectionName} score split</caption>
        <thead>
          <tr className="bg-muted text-left">
            <th scope="col" className="px-3 py-2 type-caption font-semibold">
              Part
            </th>
            <th scope="col" className="w-24 px-3 py-2 type-caption font-semibold">
              Out of
            </th>
            <th scope="col" className="w-12 px-1 py-2">
              <span className="sr-only">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const invalid = problem?.index === i;
            return (
              <tr key={i}>
                <td className="border-t border-rule px-2 py-2 align-top">
                  <Input
                    id={id("label", i)}
                    aria-label={`Part ${i + 1} name`}
                    value={row.label}
                    maxLength={20}
                    aria-invalid={invalid || undefined}
                    onChange={(e) => update(i, { label: e.target.value })}
                  />
                  {row.scores > 0 && (
                    <span className="mt-1 block px-1 type-caption text-muted-foreground">
                      {row.scores} saved {row.scores === 1 ? "score" : "scores"}
                    </span>
                  )}
                </td>
                <td className="border-t border-rule px-2 py-2 align-top">
                  <Input
                    id={id("max", i)}
                    aria-label={`${row.label || `Part ${i + 1}`} is out of`}
                    value={row.max}
                    inputMode="numeric"
                    maxLength={3}
                    className="type-figure text-right"
                    aria-invalid={invalid || undefined}
                    onChange={(e) => update(i, { max: e.target.value.replace(/[^0-9]/g, "") })}
                  />
                </td>
                <td className="border-t border-rule px-1 py-2 align-top">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${row.label || `part ${i + 1}`}`}
                    disabled={rows.length === 1}
                    onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
                  >
                    <XIcon />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-muted">
            <th scope="row" className="border-t border-rule px-3 py-2 text-left type-label">
              Total
            </th>
            <td className={`border-t border-rule px-3 py-2 text-right type-score ${total === 100 ? "text-success" : "text-warning"}`}>{total}</td>
            <td className="border-t border-rule px-1 py-2 text-center">
              {total === 100 && <CircleCheckIcon aria-label="Adds up to 100" className="mx-auto size-5 text-success" />}
            </td>
          </tr>
        </tfoot>
      </table>

      <div className="flex flex-col gap-3">
        {rows.length < MAX_PARTS && (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setRows((r) => [...r, { id: null, label: "", max: "", scores: 0 }])}>
            <PlusIcon data-icon="inline-start" />
            Add a part
          </Button>
        )}
        {problem && (dirty || saved.length === 0) && (
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
            Save score split
          </Button>
        </div>
      </div>
    </div>
  );
}
