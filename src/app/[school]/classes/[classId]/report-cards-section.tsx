import { DownloadIcon, PrinterIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Readiness } from "@/lib/report-card";

/**
 * The class page's Report cards section (spec 0012, AC-1, AC-2): whether the
 * class's cards can print in the term the Scores picker chose, and the
 * download. The button is a plain link to the PDF route, so the file
 * downloads without leaving the page. The route checks every rule again.
 */
export function ReportCardsSection({
  slug,
  classId,
  termId,
  isCurrentTerm,
  teacherTitle,
  readiness,
}: {
  slug: string;
  classId: string;
  termId: string;
  isCurrentTerm: boolean;
  teacherTitle: string;
  readiness: Readiness;
}) {
  const href = `/${slug}/classes/${classId}/report-cards${isCurrentTerm ? "" : `?term=${termId}`}`;

  return (
    <section id="report-cards" aria-labelledby="report-cards-title" className="flex scroll-mt-20 flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 id="report-cards-title" className="type-title">
          Report cards
        </h2>
        {readiness.ready && (
          <p className="text-muted-foreground">
            Ready: <span className="type-figure">{readiness.count}</span> {readiness.count === 1 ? "report card" : "report cards"}, one A4 page each
          </p>
        )}
      </div>

      {readiness.ready ? (
        <div className="flex flex-col gap-3 rounded-xl border border-rule bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="flex items-start gap-2">
              <PrinterIcon aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" />
              One PDF for the whole class. Print it in black and white.
            </p>
            {readiness.missingTeacherComments > 0 && (
              <p className="type-caption text-muted-foreground">
                <span className="type-figure">{readiness.missingTeacherComments}</span>{" "}
                {readiness.missingTeacherComments === 1 ? "student has" : "students have"} no {teacherTitle.toLowerCase()}’s comment.{" "}
                {readiness.missingTeacherComments === 1 ? "Their card leaves" : "Their cards leave"} lines to write on.
              </p>
            )}
          </div>
          <Button nativeButton={false} render={<a href={href} download />} className="shrink-0 self-start sm:self-center">
            <DownloadIcon data-icon="inline-start" />
            Download report cards
          </Button>
        </div>
      ) : readiness.reason.kind === "no_students" || readiness.reason.kind === "no_subjects" ? (
        <p className="rounded-xl border border-dashed border-input bg-card p-5 text-muted-foreground">{readiness.reason.message}</p>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-rule bg-card p-4 sm:p-5">
          <Button disabled aria-describedby="report-cards-reason" className="self-start">
            <DownloadIcon data-icon="inline-start" />
            Download report cards
          </Button>
          <div id="report-cards-reason" className="flex flex-col gap-2">
            <p>{readiness.reason.message}</p>
            {readiness.reason.kind === "incomplete" && (
              <ul className="flex flex-col gap-1.5 type-caption">
                {readiness.reason.students.map((s, i) => (
                  <li key={i} className="flex flex-col sm:flex-row sm:gap-2">
                    <span className="font-semibold">{s.name}:</span>
                    <span className="text-muted-foreground">{s.missing}</span>
                  </li>
                ))}
                {readiness.reason.more > 0 && (
                  <li className="text-muted-foreground">
                    and <span className="type-figure">{readiness.reason.more}</span> more
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
