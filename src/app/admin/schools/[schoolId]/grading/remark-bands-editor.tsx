"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { fromHundredths, MAX_REMARK_BANDS, MIN_REMARK_BANDS, REMARK_MAX, type RemarkBand, remarkBandsProblem, toHundredths } from "@/lib/remarks";

import { saveRemarkBandsAction } from "../../curriculum-actions";

const sorted = (bands: RemarkBand[]) => [...bands].sort((a, b) => (toHundredths(b.minAverage) ?? -1) - (toHundredths(a.minAverage) ?? -1));

/**
 * A school's principal's comment bands (spec 0011, AC-10): the automatic
 * head's comment each average earns. Worked out whenever a sheet or card is
 * read, so a saved change shows at once for every automatic comment.
 */
export function RemarkBandsEditor({ schoolId, saved }: { schoolId: string; saved: RemarkBand[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<RemarkBand[]>(sorted(saved));
  const [serverError, setServerError] = useState<string | null>(null);
  const problem = remarkBandsProblem(rows);
  const dirty = JSON.stringify(rows) !== JSON.stringify(sorted(saved));

  // The top of each band: the next higher band's lowest average minus 0.01, or 100.
  const mins = rows.map((r) => toHundredths(r.minAverage)).filter((m): m is number => m !== null);
  const topOf = (text: string) => {
    const min = toHundredths(text);
    if (min === null) return null;
    const above = mins.filter((m) => m > min);
    return above.length === 0 ? "100" : fromHundredths(Math.min(...above) - 1);
  };
  const update = (i: number, patch: Partial<RemarkBand>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  function save() {
    start(async () => {
      const result = await saveRemarkBandsAction(schoolId, rows);
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      setServerError(null);
      toast.add({ title: "Principal’s comments saved", description: "Every automatic comment now follows these bands, in every term.", type: "success" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ol aria-label="Principal’s comment bands" className="flex flex-col overflow-hidden rounded-lg border border-rule">
        {rows.map((row, i) => {
          const invalid = problem?.index === i;
          const top = topOf(row.minAverage);
          return (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-2 border-t border-rule p-3 first:border-t-0 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-start">
              <span className="flex items-center gap-2">
                <Input
                  aria-label={`Band ${i + 1} lowest average`}
                  value={row.minAverage}
                  inputMode="decimal"
                  maxLength={6}
                  className="w-20 type-figure text-right"
                  aria-invalid={invalid || undefined}
                  onChange={(e) => update(i, { minAverage: e.target.value.replace(/[^0-9.]/g, "") })}
                />
                <span className="type-figure whitespace-nowrap text-muted-foreground">to {top ?? "?"}</span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove band ${i + 1}`}
                disabled={rows.length <= MIN_REMARK_BANDS}
                onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
                className="sm:order-last"
              >
                <XIcon />
              </Button>
              <Textarea
                aria-label={`Band ${i + 1} wording`}
                value={row.remark}
                rows={1}
                maxLength={REMARK_MAX + 50}
                aria-invalid={invalid || undefined}
                onChange={(e) => update(i, { remark: e.target.value })}
                className="col-span-2 min-h-11 resize-none md:text-base sm:col-span-1"
              />
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-3">
        {rows.length < MAX_REMARK_BANDS && (
          <Button variant="ghost" className="self-start" onClick={() => setRows((r) => [...r, { minAverage: "", remark: "" }])}>
            <PlusIcon data-icon="inline-start" />
            Add a band
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
          {dirty && (
            <Button
              variant="ghost"
              onClick={() => {
                setRows(sorted(saved));
                setServerError(null);
              }}
            >
              Undo changes
            </Button>
          )}
          <Button onClick={save} disabled={pending || problem !== null || !dirty}>
            {pending && <Spinner data-icon="inline-start" />}
            Save comments
          </Button>
        </div>
      </div>
    </div>
  );
}
