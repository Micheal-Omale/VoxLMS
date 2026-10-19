import { DownloadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ReportCardModel } from "@/lib/report-card";
import { brand } from "@/lib/brand";

import { clearResultAction } from "./actions";

// One child's result for one term (spec 0014, AC-13), top to bottom as the
// spec orders it. Every string comes from the card model the PDF prints, so
// the screen and the download never differ. No signature image on screen.

const CARD_HREF = "/result/card";

function Download() {
  return (
    <Button nativeButton={false} size="lg" className="w-full sm:w-auto" render={<a href={CARD_HREF} download />}>
      <DownloadIcon data-icon="inline-start" />
      Download report card
    </Button>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 bg-card p-3 sm:p-4">
      <dt className="type-caption text-muted-foreground">{label}</dt>
      <dd className="type-title type-figure">{value}</dd>
    </div>
  );
}

export function ResultView({ card }: { card: ReportCardModel }) {
  const { school, student } = card;
  const logo = school.logo ? `data:image/${school.logo.format === "png" ? "png" : "jpeg"};base64,${school.logo.data.toString("base64")}` : null;

  return (
    <article className="flex w-full max-w-3xl flex-col gap-6">
      <header className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- bytes from the school's own logo, inline */}
        {logo && <img src={logo} alt="" className="size-12 shrink-0 object-contain" />}
        <div className="flex min-w-0 flex-col">
          <p className="type-heading">{school.name}</p>
          <p className="type-caption text-muted-foreground">{card.title}</p>
        </div>
      </header>

      <div className="flex flex-col gap-1">
        <h1 className="type-display">
          {student.surname} {student.otherNames}
        </h1>
        <p className="text-muted-foreground">
          {student.className} · {student.idLabel} <span className="type-figure">{student.id}</span>
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-4">
        <Figure label="Position" value={student.position} />
        <Figure label="Average" value={student.average} />
        <Figure label="Total" value={student.total} />
        <Figure label="Class average" value={student.classAverage} />
      </dl>

      <Download />

      <section aria-labelledby="subjects-heading" className="flex flex-col gap-3">
        <h2 id="subjects-heading" className="type-title">
          Subjects
        </h2>
        <ul className="flex flex-col overflow-hidden rounded-xl border border-rule bg-card">
          {card.rows.map((row) => (
            <li key={row.subject} className="border-b border-rule last:border-b-0">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-baseline gap-3 px-4 py-3 hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1 font-semibold">{row.subject}</span>
                  <span className="type-figure w-12 text-right">{row.total}</span>
                  <span className="type-figure w-8 text-center font-bold">{row.grade}</span>
                  <span className="type-figure w-12 text-right text-muted-foreground">{row.position}</span>
                </summary>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 px-4 pb-4 text-sm sm:grid-cols-3">
                  {card.columns.parts.map((label, i) => (
                    <div key={label} className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="type-figure">{row.parts[i]}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Class average</dt>
                    <dd className="type-figure">{row.classAverage}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Highest</dt>
                    <dd className="type-figure">{row.highest}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Lowest</dt>
                    <dd className="type-figure">{row.lowest}</dd>
                  </div>
                  <div className="col-span-full flex justify-between gap-2">
                    <dt className="text-muted-foreground">Remark</dt>
                    <dd>{row.remark}</dd>
                  </div>
                </dl>
              </details>
            </li>
          ))}
        </ul>
        {card.gradeKey && <p className="type-caption text-muted-foreground">{card.gradeKey}</p>}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="type-heading">{card.teacherComment.heading}</h2>
          <p>{card.teacherComment.text ?? "No comment."}</p>
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="type-heading">{card.headComment.heading}</h2>
          <p>{card.headComment.text || "No comment."}</p>
        </div>
        <p className="text-muted-foreground">
          {card.signer.name}, {card.signer.title}
        </p>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Download />
        <form action={clearResultAction}>
          <Button type="submit" variant="outline" size="lg" className="w-full sm:w-auto">
            Check another PIN
          </Button>
        </form>
      </div>

      {school.poweredBy && <p className="type-caption text-muted-foreground">Powered by {brand.name}</p>}
    </article>
  );
}
