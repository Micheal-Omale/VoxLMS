import Link from "next/link";
import { ChevronRightIcon, LockIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { termName } from "@/lib/term-label";
import type { ClassRemarks, ClassResults } from "@/server/data";

/**
 * The class page's Remarks section (spec 0011, AC-1): how many students have
 * a teacher's comment and how many head's comments still wait for scores, in
 * the term the Scores picker chose, and the way into the Remarks sheet.
 */
export function RemarksSection({ slug, results, remarks, review = false }: { slug: string; results: ClassResults; remarks: ClassRemarks; review?: boolean }) {
  const { cls, term } = results;
  const total = remarks.rows.length;
  const written = remarks.rows.filter((r) => r.teacherRemark).length;
  const waiting = remarks.rows.filter((r) => r.head.kind === "waiting").length;
  const href = `/${slug}/classes/${cls.id}/remarks${term.isCurrent ? "" : `?term=${term.id}`}`;
  const title = remarks.signerTitle.toLowerCase();

  return (
    <section aria-labelledby="remarks-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 id="remarks-title" className="type-title">
          Remarks
        </h2>
        {total > 0 && (
          <p className="text-muted-foreground">
            <span className="type-figure">{written}</span> of <span className="type-figure">{total}</span> have a teacher’s comment
            {!term.isCurrent && ` in ${termName(term.number)}`}
          </p>
        )}
      </div>

      {total === 0 ? (
        <p className="rounded-xl border border-dashed border-input bg-card p-5 text-muted-foreground">No students in {cls.name} yet, so there are no comments to write.</p>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-rule bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 flex-col gap-1">
            <p>
              {review
                ? `The form teacher’s comment for each student, and the ${title}’s comment, which fills itself in from the average.`
                : `Your comment for each student, and the ${title}’s comment, which fills itself in from the average.`}
            </p>
            {waiting > 0 && (
              <p className="type-caption text-muted-foreground">
                <span className="type-figure">{waiting}</span> {title}’s {waiting === 1 ? "comment waits" : "comments wait"} for all scores.
              </p>
            )}
            {!term.isCurrent && (
              <p className="flex items-center gap-1.5 type-caption text-muted-foreground">
                <LockIcon aria-hidden="true" className="size-3.5" />
                {termName(term.number)} is closed, so its remarks are read only.
              </p>
            )}
          </div>
          <Button nativeButton={false} render={<Link href={href} />} variant={term.isCurrent && !review ? "default" : "outline"} className="shrink-0 self-start sm:self-center">
            {review || !term.isCurrent ? "View remarks" : written === 0 ? "Write comments" : "Open remarks"}
            <ChevronRightIcon data-icon="inline-end" />
          </Button>
        </div>
      )}
    </section>
  );
}
