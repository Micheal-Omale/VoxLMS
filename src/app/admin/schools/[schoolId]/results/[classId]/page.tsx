import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { TablePropertiesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { NoCurrentTerm, NotFound } from "@/server/data";
import { getClassSlips } from "@/server/data/result-pins";
import { getSchoolSetup } from "@/server/data/setup";

import { SetupHeader } from "../../setup-header";
import { SlipButton } from "../slip-button";

export const metadata: Metadata = { title: "PIN slips" };

type Params = Promise<{ schoolId: string; classId: string }>;
type Search = Promise<{ term?: string | string[] }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default function ClassSlipsPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <ClassSlips params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** One class's slips for a term, with replace and remake (spec 0014, AC-10, AC-11). */
async function ClassSlips({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { schoolId, classId } = await params;
  const { term: termParam } = await searchParams;
  if (!UUID.test(classId)) notFound();
  const termId = typeof termParam === "string" && UUID.test(termParam) ? termParam : undefined;
  const { ctx } = await requireTeamSchoolContext(schoolId);
  const [{ school }, data] = await Promise.all([
    getSchoolSetup(ctx),
    getClassSlips(ctx, { classId, termId }).catch((error: unknown) => {
      if (error instanceof NotFound || error instanceof NoCurrentTerm) notFound();
      throw error;
    }),
  ]);
  const back = { href: `/admin/schools/${school.id}/results?term=${data.term.id}`, label: "Results online" };

  return (
    <>
      <SetupHeader
        schoolId={school.id}
        schoolName={school.name}
        title={`${data.cls.name} PIN slips`}
        intro={`${data.term.label}. A replaced slip stops working at once; slips are never printed twice.`}
        back={back}
        actions={
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={`/admin/schools/${school.id}/classes/${classId}/broadsheet?term=${data.term.id}`} />}
            className="gap-1.5"
          >
            <TablePropertiesIcon data-icon="inline-start" className="size-4" />
            Broadsheet
          </Button>
        }
      />

      <section aria-labelledby="students-heading" className="flex flex-col gap-3">
        <h2 id="students-heading" className="type-title">
          Students
        </h2>
        {data.students.length === 0 ? (
          <p className="rounded-xl border border-dashed border-input bg-card p-5 text-muted-foreground">No students in this class this term.</p>
        ) : (
          <ul className="flex flex-col overflow-hidden rounded-xl border border-rule bg-card">
            {data.students.map((s) => (
              <li key={s.enrolmentId} className="flex flex-col gap-3 border-b border-rule px-4 py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-bold">{s.name}</span>
                  {s.slip ? (
                    <span className="type-caption type-figure text-muted-foreground">
                      Live · {s.slip.serial} · made {s.slip.madeOn}
                      {s.slip.timesChecked > 0
                        ? ` · checked ${s.slip.timesChecked} ${s.slip.timesChecked === 1 ? "time" : "times"}, first ${s.slip.firstChecked}, last ${s.slip.lastChecked}`
                        : " · not checked yet"}
                      {s.replaced > 0 && ` · ${s.replaced} replaced`}
                    </span>
                  ) : (
                    <span className="type-caption text-muted-foreground">No slip{s.replaced > 0 && ` · ${s.replaced} replaced`}</span>
                  )}
                </div>
                {s.slip ? (
                  <SlipButton
                    schoolId={school.id}
                    variant="outline"
                    fields={{ do: "replace", pinId: s.slip.id }}
                    label="Replace slip"
                    confirm={{ title: `Replace ${s.name}’s slip?`, description: "The old slip stops working at once. A new slip downloads now.", action: "Replace slip", removes: true }}
                  />
                ) : (
                  <SlipButton schoolId={school.id} variant="outline" fields={{ do: "one", enrolmentId: s.enrolmentId }} label="Print slip" />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="runs-heading" className="flex flex-col gap-3">
        <h2 id="runs-heading" className="type-title">
          Prints
        </h2>
        {data.runs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-input bg-card p-5 text-muted-foreground">No slips printed for this class this term yet.</p>
        ) : (
          <ul className="flex flex-col overflow-hidden rounded-xl border border-rule bg-card">
            {data.runs.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 border-b border-rule px-4 py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between">
                <span className="type-figure">
                  {r.when}, by {r.by}: {r.slipCount} {r.slipCount === 1 ? "slip" : "slips"}, {r.checked} checked
                </span>
                <SlipButton
                  schoolId={school.id}
                  variant="outline"
                  fields={{ do: "remake", runId: r.id }}
                  label="Remake these slips"
                  disabledNote={r.live === 0 ? "Every slip from this print has been replaced." : undefined}
                  confirm={{
                    title: "Remake these slips?",
                    description: `${r.live} ${r.live === 1 ? "slip" : "slips"} from this print stop working at once.${r.liveChecked > 0 ? ` ${r.liveChecked} of them have already been checked by parents.` : ""}`,
                    action: "Remake slips",
                    removes: true,
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
