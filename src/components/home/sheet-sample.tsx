import { RedPenCircle } from "@/components/red-pen";
import { cn } from "@/lib/utils";

// Made up rows for the homepage: the score sheet as a teacher sees it, with
// one score over its maximum circled in red pen before anything is saved.
const ROWS = [
  { n: 1, surname: "ABUBAKAR", other: "Sadiq", parts: ["15", "17", "48"], total: "80", grade: "A" },
  { n: 2, surname: "ADEYEMI", other: "Tolulope", parts: ["12", "14", "39"], total: "65", grade: "B" },
  { n: 3, surname: "EZE", other: "Chukwuemeka", parts: ["25", "16", "41"], total: null, grade: null },
  { n: 4, surname: "OKON", other: "Emem", parts: ["18", "", ""], total: null, grade: null },
];

const PARTS = [
  { label: "CA 1", max: 20 },
  { label: "CA 2", max: 20 },
  { label: "Exam", max: 60 },
];

/** The hero picture: the product itself, not a drawing of it. */
export function SheetSample() {
  return (
    <figure className="w-full" aria-label="A score sheet with one score circled in red because it is above the maximum">
      <div className="ruled-sheet overflow-hidden rounded-xl border border-rule shadow-sm [--margin-x:2rem] sm:[--margin-x:2.5rem]">
        <div className="flex items-baseline justify-between gap-3 border-b border-rule py-3 pr-4 pl-[calc(var(--margin-x)+0.75rem)]">
          <span className="type-label">JSS 2 Gold · Mathematics</span>
          <span className="type-caption text-muted-foreground">
            <span className="type-figure">2</span> of <span className="type-figure">4</span> complete
          </span>
        </div>
        <div className="grid grid-cols-[var(--margin-x)_minmax(0,1fr)_repeat(3,2.75rem)_3rem] items-end gap-x-1 border-b border-rule py-2 pr-2 sm:gap-x-1.5 sm:pr-3 sm:grid-cols-[var(--margin-x)_minmax(0,1fr)_repeat(3,3.5rem)_4rem]">
          <span />
          <span className="pl-3 type-caption text-muted-foreground">Student</span>
          {PARTS.map((p) => (
            <span key={p.label} className="text-center type-caption leading-tight text-muted-foreground">
              {p.label}
              <span className="block type-figure">of {p.max}</span>
            </span>
          ))}
          <span className="text-right type-caption text-muted-foreground">Total</span>
        </div>
        {ROWS.map((row) => (
          <div key={row.n} className="border-b border-rule py-2.5 pr-2 last:border-b-0 sm:pr-3">
            <div className="grid grid-cols-[var(--margin-x)_minmax(0,1fr)_repeat(3,2.75rem)_3rem] items-center gap-x-1 sm:gap-x-1.5 sm:grid-cols-[var(--margin-x)_minmax(0,1fr)_repeat(3,3.5rem)_4rem]">
              <span className="text-center type-caption type-figure text-muted-foreground">{row.n}</span>
              <span className="truncate pl-2 sm:pl-3">
                <span className="font-bold">{row.surname}</span> <span className="max-sm:hidden">{row.other}</span>
              </span>
              {row.parts.map((value, i) => {
                const over = value !== "" && Number(value) > PARTS[i].max;
                return (
                  <span key={i} className="relative">
                    <span
                      className={cn(
                        "flex h-10 items-center justify-center rounded-md border bg-card type-score",
                        over ? "border-destructive text-destructive" : "border-input",
                        value === "" && "text-muted-foreground",
                      )}
                    >
                      {value === "" ? "–" : value}
                    </span>
                    {/* The one signature moment: the pen circles the mistake shortly after the page settles. */}
                    {over && <RedPenCircle className="[&_path]:[animation-delay:900ms]" />}
                  </span>
                );
              })}
              <span className="flex items-baseline justify-end gap-1.5">
                {row.total ? (
                  <>
                    <span className="type-score">{row.total}</span>
                    <span className="type-caption font-bold">{row.grade}</span>
                  </>
                ) : (
                  <span className="type-score text-muted-foreground">–</span>
                )}
              </span>
            </div>
            {row.n === 3 && (
              <p className="mt-1.5 animate-ink-in pl-[calc(var(--margin-x)+0.75rem)] type-caption text-destructive [animation-delay:1300ms]">
                25 is more than 20. Check the mark book before saving.
              </p>
            )}
            {row.n === 4 && <p className="mt-1.5 pl-[calc(var(--margin-x)+0.75rem)] type-caption text-muted-foreground">CA 2 and Exam not entered yet</p>}
          </div>
        ))}
      </div>
    </figure>
  );
}
